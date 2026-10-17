/**
 * El flujo de donación de punta a punta.
 *
 * Una donación es un pago de la wallet del DONANTE a la wallet del FONDO. El
 * destino no se negocia: sale de la configuración (`OP_FUND_WALLET_ADDRESS`),
 * nunca del request. Así, aunque alguien manipule la petición, el dinero solo
 * puede terminar en la cuenta principal del fondo.
 *
 * El flujo está partido en dos mitades porque el consentimiento ocurre en el
 * navegador del donante, fuera de nuestro proceso:
 *
 *   mitad 1 — start()
 *     1. resolver wallet del donante + wallet del fondo
 *     2. grant de incoming-payment   (AS del FONDO, no interactivo)
 *     3. incoming payment            (RS del FONDO)   <- el dinero entra aquí
 *     4. grant de quote              (AS del DONANTE, no interactivo)
 *     5. quote                       (RS del DONANTE)
 *     6. grant de outgoing-payment   (AS del DONANTE, INTERACTIVO)
 *     -> se devuelve `interact.redirectUrl` y se guarda el continue token
 *
 *   mitad 2 — finishFromCallback() / confirmPending()
 *     7. grant.continue              -> access token del outgoing payment
 *     8. outgoing payment            (RS del DONANTE)
 *     9. polling hasta que sentAmount >= debitAmount
 *
 * Reglas que evitan cobrar dos veces:
 *   - `externalRef` es único: dos POST con el mismo ref devuelven la misma donación.
 *   - el continue token se consume una sola vez (`store.claimContinue`).
 *   - el estado `sending` NUNCA se reintenta: solo se consulta.
 *   - un timeout de consulta deja el estado en `sending`, no en `failed`.
 */

import crypto from "node:crypto";

import {
  // `isFinalizedGrantWithAccessToken` en vez de `isFinalizedGrant`: el segundo
  // está deprecado en el SDK v7 y ambos comprueban lo mismo (que el grant
  // traiga `access_token`). Sin esta guarda, `grant.access_token` es undefined
  // y el 401 aparece tres llamadas después, donde no se entiende.
  isFinalizedGrantWithAccessToken as isFinalizedGrant,
  isPendingGrant,
  OpenPaymentsClientError,
} from "@interledger/open-payments";

import {
  resolveWalletAddress,
  toAmount,
  toWalletAddressUrl,
  wrapOpenPaymentsError,
} from "../open-payments/index.js";

/** Error de dominio con el status HTTP que le corresponde. */
export class DonationError extends Error {
  constructor(status, message, { code, hint, cause } = {}) {
    super(message, { cause });
    this.name = "DonationError";
    this.status = status;
    this.code = code ?? "DONATION_ERROR";
    this.hint = hint;
  }
}

const MINUTE = 60_000;

/**
 * @param {object} deps
 * @param {import("@interledger/open-payments").AuthenticatedClient} deps.client
 * @param {ReturnType<import("./store.js").createDonationStore>} deps.store
 * @param {ReturnType<import("./tokens.js").createTokenVault>} deps.vault
 * @param {object} deps.settings
 * @param {(input: string) => Promise<object>} [deps.resolveWallet]
 */
export function createDonationService({
  client,
  store,
  vault,
  settings,
  resolveWallet = resolveWalletAddress,
}) {
  const {
    fundWalletAddress,
    finishUrlBase, // undefined => modo polling
    incomingPaymentExpiryMs = 15 * MINUTE,
    defaultDescription = "Donación",
    minAmount = null,
    maxAmount = null,
    allowHttp = false,
  } = settings;

  if (!fundWalletAddress) {
    throw new DonationError(500, "Falta la wallet address del fondo en la configuración.");
  }

  const log = (donationId, message, extra) =>
    console.log(`[donation ${donationId}] ${message}`, extra ? JSON.stringify(extra) : "");

  // ─── Información pública del fondo ─────────────────────────────────────────

  /**
   * Lo que el frontend necesita para dibujar el formulario de donación:
   * a dónde va el dinero, en qué moneda y con qué límites.
   */
  async function getFundInfo() {
    const fund = await resolveWallet(fundWalletAddress);
    return {
      walletAddress: fund.id,
      publicName: fund.publicName ?? null,
      assetCode: fund.assetCode,
      assetScale: fund.assetScale,
      authServer: fund.authServer,
      limits: { minAmount, maxAmount },
      amountModes: ["send", "receive"],
      consentMode: finishUrlBase ? "finish" : "poll",
    };
  }

  /**
   * "Conectar" una wallet: comprobar que la dirección que escribió el donante
   * existe y es usable, y devolver su moneda para poder mostrar el monto bien
   * y advertir si habrá conversión. No firma nada ni mueve dinero.
   */
  async function connectDonorWallet(input) {
    const fund = await resolveWallet(fundWalletAddress);
    let donor;
    try {
      donor = await resolveWallet(input);
    } catch (error) {
      const wrapped = wrapOpenPaymentsError(error);
      return {
        ok: false,
        code: wrapped.code,
        message: wrapped.message,
        hint: wrapped.hint,
      };
    }

    const sameAsset =
      donor.assetCode === fund.assetCode && donor.assetScale === fund.assetScale;

    return {
      ok: true,
      donor: {
        walletAddress: donor.id,
        publicName: donor.publicName ?? null,
        assetCode: donor.assetCode,
        assetScale: donor.assetScale,
      },
      fund: {
        walletAddress: fund.id,
        publicName: fund.publicName ?? null,
        assetCode: fund.assetCode,
        assetScale: fund.assetScale,
      },
      sameAsset,
      // Con monedas distintas el pago funciona igual (ILP convierte), pero el
      // monto se fija de un solo lado y los dos importes difieren.
      conversionNotice: sameAsset
        ? null
        : `El donante paga en ${donor.assetCode} y el fondo recibe en ${fund.assetCode}: ` +
          "la cotización mostrará los dos montos.",
    };
  }

  // ─── Montos ────────────────────────────────────────────────────────────────

  /**
   * Convierte el monto que llega por HTTP al entero en la escala del activo.
   * Acepta `amount` humano ("10.50") o `amountValue` entero ya escalado.
   */
  function buildAmount({ amount, amountValue, wallet }) {
    let built;

    if (amountValue !== undefined && amountValue !== null && amountValue !== "") {
      if (!/^\d+$/.test(String(amountValue))) {
        throw new DonationError(
          400,
          `amountValue debe ser un entero en la escala del activo, como texto ` +
            `(recibido: "${amountValue}").`,
          { code: "DONATION_INVALID_AMOUNT" },
        );
      }
      built = {
        value: String(amountValue),
        assetCode: wallet.assetCode,
        assetScale: wallet.assetScale,
      };
    } else if (amount !== undefined && amount !== null && amount !== "") {
      try {
        built = toAmount(amount, wallet);
      } catch (error) {
        throw new DonationError(400, error.message, { code: "DONATION_INVALID_AMOUNT" });
      }
    } else {
      throw new DonationError(400, "Falta el monto: envía `amount` o `amountValue`.", {
        code: "DONATION_AMOUNT_REQUIRED",
      });
    }

    if (BigInt(built.value) <= 0n) {
      throw new DonationError(400, "El monto de la donación debe ser mayor que cero.", {
        code: "DONATION_INVALID_AMOUNT",
      });
    }

    // Los límites se configuran en unidades "humanas" y se comparan en la
    // escala del activo de cada lado: 10 significa 10 USD o 10 EUR.
    for (const [label, limit, compare] of [
      ["mínimo", minAmount, (a, b) => a < b],
      ["máximo", maxAmount, (a, b) => a > b],
    ]) {
      if (limit === null || limit === undefined) continue;
      const bound = toAmount(limit, wallet);
      if (compare(BigInt(built.value), BigInt(bound.value))) {
        throw new DonationError(
          400,
          `El monto está fuera del ${label} permitido (${limit} ${wallet.assetCode}).`,
          { code: "DONATION_AMOUNT_OUT_OF_RANGE" },
        );
      }
    }

    return built;
  }

  // ─── Mitad 1: preparar la donación ─────────────────────────────────────────

  /**
   * Crea incoming payment + quote + grant interactivo y devuelve la fila de la
   * donación en estado `awaiting_consent`.
   *
   * `amountMode`:
   *   - "send"    (por defecto): el donante fija lo que se le debita. Es lo que
   *     espera quien dona: "doy 10". El fondo recibe eso menos comisiones y
   *     conversión. Incoming payment sin `incomingAmount`, quote con `debitAmount`.
   *   - "receive": el fondo recibe exactamente el monto y el donante paga lo que
   *     haga falta. Incoming payment con `incomingAmount`, quote sin montos.
   */
  async function start({
    donorWalletAddress,
    amount,
    amountValue,
    amountMode = "send",
    externalRef,
    description,
    donorName,
  } = {}) {
    if (!["send", "receive"].includes(amountMode)) {
      throw new DonationError(400, 'amountMode debe ser "send" o "receive".', {
        code: "DONATION_INVALID_MODE",
      });
    }

    const ref = String(externalRef ?? `don_${crypto.randomUUID()}`);

    // Idempotencia: el mismo externalRef no abre una segunda donación.
    const existing = await store.getByExternalRef(ref);
    if (existing) return { row: existing, created: false };

    let donorUrl;
    try {
      donorUrl = toWalletAddressUrl(donorWalletAddress, { allowHttp });
    } catch (error) {
      throw new DonationError(400, `Wallet address del donante inválida: ${error.message}`, {
        code: "DONATION_INVALID_WALLET",
      });
    }

    const [donor, fund] = await Promise.all([
      resolveWallet(donorUrl).catch((error) => {
        const wrapped = wrapOpenPaymentsError(error, "resolviendo la wallet del donante");
        throw new DonationError(400, wrapped.message, {
          code: "DONATION_DONOR_UNRESOLVED",
          hint: wrapped.hint,
          cause: wrapped,
        });
      }),
      resolveWallet(fundWalletAddress),
    ]);

    if (donor.id === fund.id) {
      throw new DonationError(400, "El donante y el fondo no pueden ser la misma wallet.", {
        code: "DONATION_SAME_WALLET",
      });
    }

    // El monto se expresa en el activo del lado que lo fija.
    const requested = buildAmount({
      amount,
      amountValue,
      wallet: amountMode === "send" ? donor : fund,
    });

    const donationId = crypto.randomUUID();
    const metadata = {
      type: "donation",
      externalRef: ref,
      description: description ?? defaultDescription,
      ...(donorName ? { donorName: String(donorName).slice(0, 120) } : {}),
    };

    // ── Paso 2: grant de incoming payment en el AS del FONDO ───────────────
    // Se piden `read` y `complete` además de `create` porque después hay que
    // comprobar cuánto llegó y cerrar el cobro.
    const ipGrant = await request(
      () =>
        client.grant.request(
          { url: fund.authServer },
          {
            access_token: {
              access: [
                { type: "incoming-payment", actions: ["create", "read", "complete"] },
              ],
            },
          },
        ),
      "pidiendo el grant de incoming-payment al AS del fondo",
    );
    if (!isFinalizedGrant(ipGrant)) {
      throw new DonationError(
        502,
        "El AS del fondo no finalizó el grant de incoming-payment.",
        { code: "DONATION_GRANT_NOT_FINALIZED" },
      );
    }

    // ── Paso 3: incoming payment en el RS del FONDO ────────────────────────
    // Este recurso ES la cuenta de destino: el dinero entra directo a la
    // wallet del fondo, sin cuentas intermedias ni custodia nuestra.
    const incomingPayment = await request(
      () =>
        client.incomingPayment.create(
          { url: fund.resourceServer, accessToken: ipGrant.access_token.value },
          {
            walletAddress: fund.id, // el .id canónico, no la cadena del .env
            ...(amountMode === "receive" ? { incomingAmount: requested } : {}),
            expiresAt: new Date(Date.now() + incomingPaymentExpiryMs).toISOString(),
            metadata,
          },
        ),
      "creando el incoming payment del fondo",
    );

    // ── Paso 4: grant de quote en el AS del DONANTE ────────────────────────
    const quoteGrant = await request(
      () =>
        client.grant.request(
          { url: donor.authServer },
          { access_token: { access: [{ type: "quote", actions: ["create", "read"] }] } },
        ),
      "pidiendo el grant de quote al AS del donante",
    );
    if (!isFinalizedGrant(quoteGrant)) {
      throw new DonationError(502, "El AS del donante no finalizó el grant de quote.", {
        code: "DONATION_GRANT_NOT_FINALIZED",
      });
    }

    // ── Paso 5: quote en el RS del DONANTE ─────────────────────────────────
    // La quote vive del lado del que paga, apuntando al incoming payment.
    const quote = await request(
      () =>
        client.quote.create(
          { url: donor.resourceServer, accessToken: quoteGrant.access_token.value },
          {
            walletAddress: donor.id,
            receiver: incomingPayment.id,
            method: "ilp",
            ...(amountMode === "send" ? { debitAmount: requested } : {}),
          },
        ),
      "cotizando la donación",
    );

    // ── Paso 6: grant interactivo de outgoing payment ──────────────────────
    const clientNonce = crypto.randomUUID();
    const interactMode = finishUrlBase ? "finish" : "poll";

    const grantRequest = {
      access_token: {
        access: [
          {
            type: "outgoing-payment",
            actions: ["create", "read"],
            identifier: donor.id,
            // Mínimo privilegio: el token solo sirve para debitar como máximo
            // lo cotizado y solo hacia el incoming payment del fondo. Si se
            // filtrara, no puede pagar a otro destino ni por más dinero.
            limits: { debitAmount: quote.debitAmount, receiver: incomingPayment.id },
          },
        ],
      },
      interact: {
        start: ["redirect"],
        ...(interactMode === "finish"
          ? {
              finish: {
                method: "redirect",
                // El id va en la ruta, no en el query: así sobrevive a un AS
                // que no preserve los parámetros de la finish uri.
                uri: `${finishUrlBase}/${donationId}`,
                nonce: clientNonce,
              },
            }
          : {}),
      },
    };

    const pending = await request(
      () => client.grant.request({ url: donor.authServer }, grantRequest),
      "pidiendo el grant interactivo de outgoing-payment",
    );
    if (!isPendingGrant(pending)) {
      // Un grant de outgoing-payment finalizado sin interacción significaría
      // que nadie autorizó el cargo: no se sigue adelante.
      throw new DonationError(
        502,
        "El AS del donante no pidió consentimiento para el pago saliente.",
        { code: "DONATION_GRANT_NOT_INTERACTIVE" },
      );
    }

    const sameAsset =
      donor.assetCode === fund.assetCode && donor.assetScale === fund.assetScale;

    const { row } = await store.create({
      id: donationId,
      externalRef: ref,
      status: "awaiting_consent",

      donorWalletUrl: donor.id,
      donorAsset: { assetCode: donor.assetCode, assetScale: donor.assetScale },
      fundWalletUrl: fund.id,
      fundPublicName: fund.publicName ?? null,
      fundAsset: { assetCode: fund.assetCode, assetScale: fund.assetScale },
      sameAsset,

      // A dónde hay que volver a hablar para este pago.
      authServer: donor.authServer,
      resourceServer: donor.resourceServer,

      amountMode,
      description: metadata.description,
      donorName: metadata.donorName ?? null,

      incomingPaymentId: incomingPayment.id,
      quoteId: quote.id,
      quoteExpiresAt: quote.expiresAt ?? null,
      debitAmount: quote.debitAmount,
      receiveAmount: quote.receiveAmount,
      sentAmount: null,
      receivedAmount: incomingPayment.receivedAmount ?? null,
      outgoingPaymentId: null,

      // Credenciales: siempre cifradas, nunca en logs ni en la vista pública.
      ipAccessToken: vault.seal(ipGrant.access_token.value),
      ipTokenManage: ipGrant.access_token.manage ?? null,
      continueUri: pending.continue.uri,
      continueToken: vault.seal(pending.continue.access_token.value),
      continueWait: pending.continue.wait ?? 5,
      continueConsumed: false,
      clientNonce,
      asNonce: pending.interact.finish ?? null,
      interactMode,
      redirectUrl: pending.interact.redirect,
      consentExpiresAt: quote.expiresAt ?? null,

      opAccessToken: null,
      opTokenManage: null,
      opTokenExpiresAt: null,
      failureReason: null,
    });

    log(donationId, "preparada", {
      incomingPaymentId: incomingPayment.id,
      quoteId: quote.id,
      debit: quote.debitAmount?.value,
      receive: quote.receiveAmount?.value,
    });

    return { row, created: true };
  }

  // ─── Mitad 2: el donante ya consintió ──────────────────────────────────────

  /**
   * Callback del authorization server (modo `finish`). Es un endpoint de
   * seguridad: se verifica el hash antes de tocar nada y el continue token se
   * consume una sola vez, para que recargar el navegador no cobre dos veces.
   *
   * @param {object} params
   * @param {object} params.row  donación localizada por el id de la ruta
   * @param {(args: object) => boolean} params.verifyHash
   */
  async function finishFromCallback({ row, hash, interactRef, result, verifyHash }) {
    // El donante declinó: es una decisión del usuario, no un fallo del sistema.
    if (result === "grant_rejected") {
      const cancelled = await cancel(row.id, "El donante rechazó la autorización.", {
        force: true,
      });
      return { row: cancelled, outcome: "rejected" };
    }

    // Recarga del navegador sobre un callback ya procesado: idempotente.
    if (row.continueConsumed || row.status !== "awaiting_consent") {
      return { row: await store.get(row.id), outcome: "already_processed" };
    }

    const valid = verifyHash({
      clientNonce: row.clientNonce,
      asNonce: row.asNonce,
      interactRef,
      grantEndpoint: row.authServer,
      hash,
    });
    if (!valid) {
      throw new DonationError(400, "El hash de interacción no es válido.", {
        code: "DONATION_BAD_INTERACT_HASH",
        hint:
          "El callback no proviene del authorization server, o el nonce guardado " +
          "no corresponde a este grant.",
      });
    }

    // Reclamar ANTES de continuar: si dos callbacks entran a la vez, solo uno
    // sigue. El perdedor devuelve el estado actual.
    if (!(await store.claimContinue(row.id))) {
      return { row: await store.get(row.id), outcome: "already_processed" };
    }

    const finalized = await continueGrant(row, { interactRef });
    if (!finalized) {
      const updated = await store.update(row.id, {
        status: "expired",
        failureReason: "El grant no quedó finalizado tras el consentimiento.",
      });
      return { row: updated, outcome: "expired" };
    }

    const authorized = await storeAuthorization(row.id, finalized);
    const sending = await createOutgoingPayment(authorized);
    return { row: sending, outcome: sending.status };
  }

  /**
   * Modo polling (sin `finish`): el cliente avisa de que ya consintió. Se
   * puede llamar varias veces; mientras el AS siga pendiente devuelve
   * `pending` con cuántos segundos esperar.
   */
  async function confirmPending(donationId) {
    const row = await mustGet(donationId);

    if (row.status !== "awaiting_consent") {
      // Ya avanzó (o terminó): no hay nada que confirmar.
      return { row, outcome: row.status };
    }
    if (row.interactMode !== "poll") {
      throw new DonationError(
        409,
        "Esta donación se completa por el callback del authorization server, " +
          "no por confirmación manual.",
        { code: "DONATION_WRONG_INTERACT_MODE" },
      );
    }

    let finalized;
    try {
      finalized = await continueGrant(row, { interactRef: null });
    } catch (error) {
      // 401 en modo polling = el donante todavía no consintió. No es un error.
      if (error?.cause instanceof OpenPaymentsClientError && error.cause.status === 401) {
        return { row, outcome: "pending", retryAfter: row.continueWait ?? 5 };
      }
      throw error;
    }
    if (!finalized) {
      return { row, outcome: "pending", retryAfter: row.continueWait ?? 5 };
    }

    // En polling el token se consume al tener éxito, no antes: un intento
    // temprano no debe dejar la donación sin forma de continuar.
    await store.claimContinue(row.id);
    const authorized = await storeAuthorization(row.id, finalized);
    const sending = await createOutgoingPayment(authorized);
    return { row: sending, outcome: sending.status };
  }

  /** `grant.continue`. Devuelve el grant finalizado o null si sigue pendiente. */
  async function continueGrant(row, { interactRef }) {
    const grant = await request(
      () =>
        client.grant.continue(
          { url: row.continueUri, accessToken: vault.open(row.continueToken) },
          // Sin `finish` el continue va sin body; con `finish` el interact_ref
          // es obligatorio.
          interactRef ? { interact_ref: String(interactRef) } : undefined,
        ),
      "continuando el grant tras el consentimiento",
    );
    return isFinalizedGrant(grant) ? grant : null;
  }

  async function storeAuthorization(donationId, finalized) {
    return store.update(donationId, {
      status: "authorized",
      opAccessToken: vault.seal(finalized.access_token.value),
      opTokenManage: finalized.access_token.manage ?? null,
      opTokenExpiresAt: finalized.access_token.expires_in
        ? new Date(Date.now() + finalized.access_token.expires_in * 1000).toISOString()
        : null,
    });
  }

  /**
   * Paso 8: crear el outgoing payment. Es el único momento en que se mueve
   * dinero, así que está blindado contra duplicados: solo corre desde
   * `authorized` y solo si no hay ya un outgoing payment guardado.
   */
  async function createOutgoingPayment(row) {
    if (!row) return row;
    if (row.outgoingPaymentId) return row;
    if (row.status !== "authorized") return row;

    if (row.opTokenExpiresAt && new Date(row.opTokenExpiresAt) <= new Date()) {
      return store.update(row.id, {
        status: "expired",
        failureReason:
          "El access token del pago expiró antes de poder crearlo. " +
          "Hay que iniciar una donación nueva.",
      });
    }

    try {
      const outgoing = await client.outgoingPayment.create(
        { url: row.resourceServer, accessToken: vault.open(row.opAccessToken) },
        {
          walletAddress: row.donorWalletUrl,
          quoteId: row.quoteId,
          metadata: {
            type: "donation",
            externalRef: row.externalRef,
            description: row.description ?? defaultDescription,
          },
        },
      );

      log(row.id, "outgoing payment creado", { outgoingPaymentId: outgoing.id });

      return store.update(row.id, {
        status: "sending",
        outgoingPaymentId: outgoing.id,
        debitAmount: outgoing.debitAmount ?? row.debitAmount,
        receiveAmount: outgoing.receiveAmount ?? row.receiveAmount,
        sentAmount: outgoing.sentAmount ?? null,
      });
    } catch (error) {
      const wrapped = wrapOpenPaymentsError(error, "creando el outgoing payment");
      const status = error instanceof OpenPaymentsClientError ? error.status : undefined;
      // 4xx: la quote expiró, el límite no alcanza o el grant no sirve -> no
      // hay nada que reintentar. 5xx o red: se queda en `authorized` y el job
      // de reanudación vuelve a intentarlo.
      const terminal = status !== undefined && status >= 400 && status < 500;
      console.error(`[donation ${row.id}] no se pudo crear el pago: ${wrapped.message}`);
      return store.update(row.id, {
        status: terminal ? "failed" : "authorized",
        failureReason: wrapped.message,
      });
    }
  }

  /**
   * Consulta el estado real del pago en el proveedor. El envío por ILP es
   * asíncrono: `outgoingPayment.create` responde con `sentAmount = 0`.
   *
   * Un fallo de consulta NO cambia el estado: no saber todavía no es fallar.
   */
  async function refresh(row) {
    if (!row || row.status !== "sending" || !row.outgoingPaymentId) return row;

    let outgoing;
    try {
      outgoing = await client.outgoingPayment.get({
        url: row.outgoingPaymentId,
        accessToken: vault.open(row.opAccessToken),
      });
    } catch (error) {
      console.warn(
        `[donation ${row.id}] no se pudo consultar el pago: ` +
          `${wrapOpenPaymentsError(error).message}`,
      );
      return row;
    }

    if (outgoing.failed) {
      await closeIncomingPayment(row);
      await revokeCredentials(row);
      return store.update(row.id, {
        status: "failed",
        sentAmount: outgoing.sentAmount ?? null,
        failureReason: `El proveedor marcó el pago como fallido. Enviado: ${
          outgoing.sentAmount?.value ?? "0"
        }.`,
      });
    }

    const sent = BigInt(outgoing.sentAmount?.value ?? "0");
    const debit = BigInt(outgoing.debitAmount?.value ?? row.debitAmount?.value ?? "0");

    if (debit > 0n && sent >= debit) {
      // Confirmación desde el lado del fondo: cuánto entró de verdad.
      const received = await readReceivedAmount(row);
      await closeIncomingPayment(row);
      await revokeCredentials(row);
      log(row.id, "completada", { sent: outgoing.sentAmount?.value });
      return store.update(row.id, {
        status: "completed",
        sentAmount: outgoing.sentAmount ?? null,
        receivedAmount: received ?? row.receivedAmount ?? null,
        failureReason: null,
      });
    }

    // Sigue en curso: se guarda el avance y el estado no se toca.
    return store.update(row.id, { sentAmount: outgoing.sentAmount ?? null });
  }

  /** Cuánto llegó al fondo, leído del incoming payment. */
  async function readReceivedAmount(row) {
    if (!row.incomingPaymentId || !row.ipAccessToken) return null;
    try {
      const incoming = await client.incomingPayment.get({
        url: row.incomingPaymentId,
        accessToken: vault.open(row.ipAccessToken),
      });
      return incoming.receivedAmount ?? null;
    } catch (error) {
      console.warn(`[donation ${row.id}] no se pudo leer el incoming payment: ${error.message}`);
      return null;
    }
  }

  /**
   * Cierra el cobro para que no acepte más fondos. Importante en modo "send":
   * el incoming payment no tiene `incomingAmount`, así que quedaría abierto.
   */
  async function closeIncomingPayment(row) {
    if (!row.incomingPaymentId || !row.ipAccessToken) return;
    try {
      await client.incomingPayment.complete({
        url: row.incomingPaymentId,
        accessToken: vault.open(row.ipAccessToken),
      });
    } catch (error) {
      // 409 = ya estaba completado (es el caso normal en modo "receive").
      const status = error instanceof OpenPaymentsClientError ? error.status : undefined;
      if (status !== 409) {
        console.warn(`[donation ${row.id}] no se pudo cerrar el cobro: ${error.message}`);
      }
    }
  }

  /** Revoca los access tokens de un pago puntual en cuanto deja de hacer falta. */
  async function revokeCredentials(row) {
    const tasks = [];
    for (const [manage, sealed] of [
      [row.opTokenManage, row.opAccessToken],
      [row.ipTokenManage, row.ipAccessToken],
    ]) {
      if (!manage || !sealed) continue;
      tasks.push(client.token.revoke({ url: manage, accessToken: vault.open(sealed) }));
    }
    for (const result of await Promise.allSettled(tasks)) {
      if (result.status === "rejected") {
        console.warn(`[donation ${row.id}] revocación fallida: ${result.reason?.message}`);
      }
    }
    // Se borran de la fila: ya no sirven y así no quedan guardados.
    await store.update(row.id, { opAccessToken: null, ipAccessToken: null });
  }

  // ─── Consulta y cancelación ────────────────────────────────────────────────

  async function mustGet(donationId) {
    const row = await store.get(String(donationId ?? ""));
    if (!row) {
      throw new DonationError(404, "No existe esa donación.", { code: "DONATION_NOT_FOUND" });
    }
    return row;
  }

  /** Estado para el polling del frontend. Refresca contra el proveedor si procede. */
  async function getStatus(donationId, { refresh: doRefresh = true } = {}) {
    const row = await mustGet(donationId);
    if (!doRefresh) return row;

    if (row.status === "sending") return refresh(row);
    if (row.status === "authorized") return createOutgoingPayment(row);
    if (row.status === "awaiting_consent" && isExpired(row)) {
      return store.update(row.id, {
        status: "expired",
        failureReason: "La cotización caducó sin que el donante autorizara.",
      });
    }
    return row;
  }

  /**
   * Cancela la donación: cierra el cobro, cancela el grant pendiente y revoca
   * los tokens. No se puede cancelar un pago que ya salió: el dinero está en
   * la red y lo que corresponde es consultar su estado.
   */
  async function cancel(donationId, reason, { force = false } = {}) {
    const row = typeof donationId === "object" ? donationId : await mustGet(donationId);

    if (["completed", "sending"].includes(row.status) && !force) {
      throw new DonationError(
        409,
        "La donación ya está en curso o completada: no se puede cancelar.",
        { code: "DONATION_NOT_CANCELLABLE" },
      );
    }
    if (["cancelled", "failed", "expired"].includes(row.status)) return row;

    await closeIncomingPayment(row);

    if (row.status === "awaiting_consent" && !row.continueConsumed && row.continueUri) {
      try {
        await client.grant.cancel({
          url: row.continueUri,
          accessToken: vault.open(row.continueToken),
        });
      } catch (error) {
        console.warn(`[donation ${row.id}] no se pudo cancelar el grant: ${error.message}`);
      }
    }

    await revokeCredentials(row);
    log(row.id, "cancelada", { reason: reason ?? null });

    return store.update(row.id, {
      status: "cancelled",
      failureReason: reason ?? "Cancelada.",
      continueConsumed: true,
    });
  }

  function isExpired(row) {
    if (!row.quoteExpiresAt) return false;
    return new Date(row.quoteExpiresAt) <= new Date();
  }

  /**
   * Job de reanudación: rescata las donaciones que quedaron a medio camino
   * cuando el proceso se reinició.
   */
  async function resumeAll() {
    const rows = await store.resumable();
    const summary = { revisadas: rows.length, avanzadas: 0, expiradas: 0 };

    for (const row of rows) {
      try {
        if (row.status === "awaiting_consent") {
          if (isExpired(row)) {
            await store.update(row.id, {
              status: "expired",
              failureReason: "La cotización caducó sin consentimiento.",
            });
            summary.expiradas += 1;
          }
          continue; // si no caducó, se espera al donante
        }
        if (row.status === "authorized") {
          // El POST del pago nunca se hizo (o falló con 5xx).
          await createOutgoingPayment(row);
          summary.avanzadas += 1;
          continue;
        }
        if (row.status === "sending") {
          await refresh(row);
          summary.avanzadas += 1;
        }
      } catch (error) {
        console.warn(`[resume ${row.id}] ${error.message}`);
      }
    }

    return summary;
  }

  /**
   * Envuelve una llamada al SDK para que el error salga ya traducido y con la
   * causa original adjunta (quien lo atrapa puede mirar el status del proveedor).
   *
   * El status HTTP es 502 incluso si el proveedor devolvió un 4xx: desde el
   * punto de vista de quien llama a nuestra API, la petición era correcta y
   * fue el proveedor —o nuestra integración— lo que falló. Las validaciones
   * que sí son culpa del cliente se lanzan antes, con 400.
   */
  async function request(fn, context) {
    try {
      return await fn();
    } catch (error) {
      const wrapped = wrapOpenPaymentsError(error, context);
      throw new DonationError(502, wrapped.message, {
        code: wrapped.code,
        hint: wrapped.hint,
        cause: error,
      });
    }
  }

  return {
    getFundInfo,
    connectDonorWallet,
    start,
    finishFromCallback,
    confirmPending,
    getStatus,
    cancel,
    refresh,
    resumeAll,
  };
}
