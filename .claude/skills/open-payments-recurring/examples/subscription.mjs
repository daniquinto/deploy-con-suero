/**
 * Suscripcion con Open Payments: un consentimiento interactivo, N cobros.
 *
 * Dos fases:
 *   1) alta:  grant de outgoing-payment con limits.interval  -> URL de consentimiento
 *   2) cobro: incoming payment + quote NUEVA + outgoing payment con el token guardado
 *
 * El store es en memoria; en produccion usa el esquema SQL de SKILL.md, con
 * UNIQUE (subscription_id, period_key) para impedir el doble cobro.
 *
 * Uso:
 *   node subscription.mjs alta        # imprime la URL de consentimiento
 *   node subscription.mjs continuar   # tras aceptar en el navegador
 *   node subscription.mjs cobrar      # cobra el periodo actual
 */
import crypto from "node:crypto";
import fs from "node:fs";
import {
  createAuthenticatedClient,
  isFinalizedGrant,
  isPendingGrant,
  OpenPaymentsClientError,
} from "@interledger/open-payments";

const env = (n, d) => {
  const v = process.env[n] ?? d;
  if (!v) throw new Error(`Falta la variable de entorno ${n}`);
  return v;
};

// Store de juguete en disco. NO guardes tokens en claro en produccion: cifralos.
const STATE_FILE = process.env.SUB_STATE_FILE ?? "./subscription.state.json";
const load = () => (fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {});
const save = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

const MONTO_POR_PERIODO = process.env.SUB_AMOUNT ?? "500";   // 5,00 con escala 2
const TECHO_POR_PERIODO = process.env.SUB_CAP ?? "600";      // margen para comisiones
const INTERVALO = process.env.SUB_INTERVAL ?? `R12/${new Date().toISOString()}/P1M`;

const client = await createAuthenticatedClient({
  walletAddressUrl: env("OP_CLIENT_WALLET_ADDRESS"),
  privateKey: process.env.OP_PRIVATE_KEY_PATH ?? "private.key",
  keyId: env("OP_KEY_ID"),
});

const getWallets = async () => Promise.all([
  client.walletAddress.get({ url: env("OP_SENDER_WALLET_ADDRESS") }),
  client.walletAddress.get({ url: env("OP_RECEIVER_WALLET_ADDRESS") }),
]);

// ─── Fase 1: alta de la suscripcion ──────────────────────────────────────────
async function alta() {
  const [sender] = await getWallets();
  const nonce = crypto.randomUUID();

  const pending = await client.grant.request(
    { url: sender.authServer },
    {
      access_token: {
        access: [{
          type: "outgoing-payment",
          actions: ["create", "read", "list"],
          identifier: sender.id,
          limits: {
            // El techo se REINICIA en cada periodo del interval.
            debitAmount: {
              assetCode: sender.assetCode,
              assetScale: sender.assetScale,
              value: TECHO_POR_PERIODO,
            },
            interval: INTERVALO,
          },
        }],
      },
      interact: { start: ["redirect"] },   // sin finish: este ejemplo es CLI
    },
  );
  if (!isPendingGrant(pending)) throw new Error("Se esperaba un grant interactivo");

  save({
    status: "pending",
    senderWalletUrl: sender.id,
    authServer: sender.authServer,
    resourceServer: sender.resourceServer,
    assetCode: sender.assetCode,
    assetScale: sender.assetScale,
    interval: INTERVALO,
    capValue: TECHO_POR_PERIODO,
    continueUri: pending.continue.uri,
    continueToken: pending.continue.access_token.value,
    continueWait: pending.continue.wait ?? 5,
    clientNonce: nonce,
    charges: {},
  });

  console.log("Autoriza la suscripcion aqui:");
  console.log(`  ${pending.interact.redirect}`);
  console.log(`\nIntervalo: ${INTERVALO}`);
  console.log(`Techo por periodo: ${TECHO_POR_PERIODO} (escala ${sender.assetScale})`);
  console.log("\nLuego ejecuta: node subscription.mjs continuar");
}

// ─── Fase 1b: continuar el grant tras el consentimiento ──────────────────────
async function continuar() {
  const s = load();
  if (s.status !== "pending") throw new Error(`Estado inesperado: ${s.status}`);

  let finalized;
  try {
    finalized = await client.grant.continue({
      url: s.continueUri,
      accessToken: s.continueToken,
    });
  } catch (err) {
    if (err instanceof OpenPaymentsClientError && err.status === 401) {
      console.error("Todavia no has aceptado la autorizacion en el navegador.");
      process.exit(1);
    }
    throw err;
  }
  if (!isFinalizedGrant(finalized)) {
    console.error("El grant sigue pendiente.");
    process.exit(1);
  }

  // value y manage se guardan JUNTOS: rotar cambia los dos.
  save({
    ...s,
    status: "active",
    continueUri: null,
    continueToken: null,
    accessToken: finalized.access_token.value,
    tokenManage: finalized.access_token.manage,
    tokenExpiresAt: finalized.access_token.expires_in
      ? new Date(Date.now() + finalized.access_token.expires_in * 1000).toISOString()
      : null,
    periodSpent: "0",
    periodKey: null,
  });
  console.log("Suscripcion activa. Ya puedes cobrar sin interaccion del usuario.");
}

/** Rota con margen; nunca esperes el 401 para rotar. */
async function ensureFreshToken(s) {
  const margin = 60_000;
  if (!s.tokenExpiresAt || new Date(s.tokenExpiresAt).getTime() - Date.now() > margin) {
    return s.accessToken;
  }
  const rotated = await client.token.rotate({ url: s.tokenManage, accessToken: s.accessToken });
  save({
    ...s,
    accessToken: rotated.access_token.value,
    tokenManage: rotated.access_token.manage,
    tokenExpiresAt: rotated.access_token.expires_in
      ? new Date(Date.now() + rotated.access_token.expires_in * 1000).toISOString()
      : null,
  });
  console.log("Token rotado.");
  return rotated.access_token.value;
}

// ─── Fase 2: cobro del periodo ───────────────────────────────────────────────
async function cobrar() {
  let s = load();
  if (s.status !== "active") throw new Error(`La suscripcion no esta activa (${s.status})`);

  const periodKey = new Date().toISOString().slice(0, 7);      // "2026-03"

  // Idempotencia: un cobro por periodo. En SQL esto es un UNIQUE constraint.
  if (s.charges?.[periodKey]?.outgoingPaymentId) {
    console.log(`El periodo ${periodKey} ya se cobro: ${s.charges[periodKey].outgoingPaymentId}`);
    return;
  }
  // El techo se reinicia al cambiar de periodo
  if (s.periodKey !== periodKey) {
    s = { ...s, periodKey, periodSpent: "0" };
    save(s);
  }

  const token = await ensureFreshToken(load());
  s = load();

  const [sender, receiver] = await getWallets();

  // Incoming payment del periodo (grant propio, no interactivo)
  const ipGrant = await client.grant.request(
    { url: receiver.authServer },
    { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read"] }] } },
  );
  if (!isFinalizedGrant(ipGrant)) throw new Error("Grant de incoming-payment no finalizado");

  const incomingPayment = await client.incomingPayment.create(
    { url: receiver.resourceServer, accessToken: ipGrant.access_token.value },
    {
      walletAddress: receiver.id,
      incomingAmount: {
        assetCode: receiver.assetCode,
        assetScale: receiver.assetScale,
        value: MONTO_POR_PERIODO,
      },
      metadata: { description: `Suscripcion ${periodKey}`, externalRef: `sub:${periodKey}` },
    },
  );

  // Quote NUEVA: las tasas cambian y la anterior ya expiro
  const quoteGrant = await client.grant.request(
    { url: sender.authServer },
    { access_token: { access: [{ type: "quote", actions: ["create"] }] } },
  );
  if (!isFinalizedGrant(quoteGrant)) throw new Error("Grant de quote no finalizado");

  const quote = await client.quote.create(
    { url: sender.resourceServer, accessToken: quoteGrant.access_token.value },
    { walletAddress: sender.id, receiver: incomingPayment.id, method: "ilp" },
  );

  // Chequeo local del techo: falla antes y con un mensaje claro.
  // La autorizacion real la hace el authorization server.
  const gastado = BigInt(s.periodSpent ?? "0");
  const techo = BigInt(s.capValue);
  if (gastado + BigInt(quote.debitAmount.value) > techo) {
    console.error(
      `El cobro (${quote.debitAmount.value}) excede el techo del periodo ` +
      `(gastado ${gastado}, techo ${techo}). Hay que pedir un nuevo consentimiento.`,
    );
    save({ ...s, status: "exhausted" });
    process.exit(1);
  }

  // Outgoing payment SIN interaccion: el consentimiento ya se dio en el alta
  try {
    const op = await client.outgoingPayment.create(
      { url: sender.resourceServer, accessToken: token },
      {
        walletAddress: sender.id,
        quoteId: quote.id,
        metadata: { externalRef: `sub:${periodKey}` },
      },
    );
    save({
      ...load(),
      periodSpent: (gastado + BigInt(quote.debitAmount.value)).toString(),
      charges: {
        ...(s.charges ?? {}),
        [periodKey]: { outgoingPaymentId: op.id, incomingPaymentId: incomingPayment.id, quoteId: quote.id },
      },
    });
    console.log(`Cobro ${periodKey} creado: ${op.id}`);
    console.log(`Debitado ${quote.debitAmount.value} para entregar ${quote.receiveAmount.value}`);
  } catch (err) {
    if (err instanceof OpenPaymentsClientError && (err.status === 401 || err.status === 403)) {
      console.error(
        `El authorization server rechazo el cobro (${err.status}): ${err.description}\n` +
        "Causas tipicas: el usuario revoco el grant, se agoto el interval, o el monto " +
        "excede el techo. Hay que relanzar el grant interactivo.",
      );
      save({ ...load(), status: "needs_consent" });
      process.exit(1);
    }
    throw err;
  }
}

const cmd = process.argv[2];
const acciones = { alta, continuar, cobrar };
if (!acciones[cmd]) {
  console.error("Uso: node subscription.mjs <alta|continuar|cobrar>");
  process.exit(1);
}
await acciones[cmd]().catch((err) => {
  if (err instanceof OpenPaymentsClientError) {
    console.error(`OpenPaymentsClientError ${err.status}: ${err.description}`);
  } else console.error(err);
  process.exit(1);
});
