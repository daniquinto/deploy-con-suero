/**
 * Pruebas del flujo de donación de punta a punta, con un cliente de Open
 * Payments falso. Cubren lo que no se puede probar a mano sin arriesgar
 * dinero: el orden de las llamadas, qué URL y qué token va en cada una, y los
 * caminos que evitan el doble cobro.
 */

import "./helpers/env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { fakeClient, fakeResolver, DONOR, FUND } from "./helpers/env.mjs";

const { createDonationService, DonationError } = await import("../src/donations/flow.js");
const { createDonationStore } = await import("../src/donations/store.js");
const { createTokenVault } = await import("../src/donations/tokens.js");
const { verifyInteractHash } = await import("../src/donations/interact-hash.js");

const FINISH_BASE = "https://api.example.test/op/callback";

function build({ client = fakeClient(), settings = {} } = {}) {
  const store = createDonationStore();
  const vault = createTokenVault("secreto-de-pruebas");
  const service = createDonationService({
    client,
    store,
    vault,
    resolveWallet: fakeResolver(),
    settings: {
      fundWalletAddress: FUND.id,
      finishUrlBase: FINISH_BASE,
      ...settings,
    },
  });
  return { service, store, client, vault };
}

const startArgs = (overrides = {}) => ({
  donorWalletAddress: DONOR.id,
  amount: "10",
  externalRef: "ORD-1",
  ...overrides,
});

/** Reproduce el hash que enviaría el authorization server. */
function hashFromAs(row, interactRef) {
  const base = `${row.clientNonce}\n${row.asNonce}\n${interactRef}\n${row.authServer}`;
  return crypto.createHash("sha256").update(base).digest("base64url");
}

const called = (client, name) => client.calls.filter((call) => call.name === name);

// ─── Mitad 1 ─────────────────────────────────────────────────────────────────

test("el flujo pide los grants al servidor correcto y en orden", async () => {
  const { service, client } = build();
  const { row, created } = await service.start(startArgs());

  assert.equal(created, true);
  assert.equal(row.status, "awaiting_consent");

  assert.deepEqual(
    client.calls.map((call) => call.name),
    [
      "grant.request", // incoming payment, AS del fondo
      "incomingPayment.create", // RS del fondo
      "grant.request", // quote, AS del donante
      "quote.create", // RS del donante
      "grant.request", // outgoing payment, AS del donante (interactivo)
    ],
  );

  const [ipGrant, quoteGrant, opGrant] = called(client, "grant.request");
  assert.equal(ipGrant.args[0].url, FUND.authServer, "el grant del cobro va al AS del fondo");
  assert.equal(quoteGrant.args[0].url, DONOR.authServer, "la quote es del lado del donante");
  assert.equal(opGrant.args[0].url, DONOR.authServer);

  // Cada recurso se crea en el resource server de su dueño, con su token.
  const [ip] = called(client, "incomingPayment.create");
  assert.equal(ip.args[0].url, FUND.resourceServer);
  assert.equal(ip.args[0].accessToken, "token-incoming-payment");

  const [quote] = called(client, "quote.create");
  assert.equal(quote.args[0].url, DONOR.resourceServer);
  assert.equal(quote.args[0].accessToken, "token-quote");
});

test("el dinero solo puede ir a la wallet del fondo", async () => {
  const { service, client } = build();
  // Aunque el cliente intente colar un destino, el servicio lo ignora.
  await service.start(
    startArgs({ receiverWalletAddress: "https://ilp.example.test/atacante", fundWalletAddress: "x" }),
  );

  const [ip] = called(client, "incomingPayment.create");
  assert.equal(ip.args[1].walletAddress, FUND.id, "el cobro se crea en la wallet del fondo");

  const [quote] = called(client, "quote.create");
  assert.equal(quote.args[1].receiver, "https://ilp.example.test/incoming-payments/ip-1");
});

test("modo send: el donante fija el débito y el cobro queda abierto", async () => {
  const { service, client } = build();
  await service.start(startArgs({ amountMode: "send", amount: "10" }));

  const [ip] = called(client, "incomingPayment.create");
  assert.equal(ip.args[1].incomingAmount, undefined, "fixed-send: sin incomingAmount");

  const [quote] = called(client, "quote.create");
  assert.deepEqual(quote.args[1].debitAmount, {
    value: "1000",
    assetCode: "USD",
    assetScale: 2,
  });

  // El donante paga 10,00 y al fondo llegan 9,70: los dos montos se guardan,
  // porque con comisiones (o conversión) nunca son el mismo número.
  const { row } = await service.start(startArgs({ externalRef: "ORD-send" }));
  assert.equal(row.debitAmount.value, "1000");
  assert.equal(row.receiveAmount.value, "970");
});

test("modo receive: el fondo recibe el monto exacto y la quote no lleva montos", async () => {
  const { service, client } = build();
  const { row } = await service.start(startArgs({ amountMode: "receive", amount: "25.50" }));

  const [ip] = called(client, "incomingPayment.create");
  assert.deepEqual(ip.args[1].incomingAmount, {
    value: "2550",
    assetCode: "USD",
    assetScale: 2,
  });

  const [quote] = called(client, "quote.create");
  assert.equal(quote.args[1].debitAmount, undefined, "excluyente con incomingAmount");
  assert.equal(row.amountMode, "receive");
});

test("el grant interactivo limita el token a ese monto y ese destino", async () => {
  const { service, client } = build();
  const { row } = await service.start(startArgs());

  const [, , opGrant] = called(client, "grant.request");
  const access = opGrant.args[1].access_token.access[0];

  assert.equal(access.type, "outgoing-payment");
  assert.deepEqual(access.actions, ["create", "read"]);
  assert.equal(access.identifier, DONOR.id, "ata el grant a la wallet del donante");
  // El techo es exactamente el débito que cotizó el proveedor, ni un céntimo más.
  assert.deepEqual(access.limits.debitAmount, { value: "1000", assetCode: "USD", assetScale: 2 });
  assert.equal(
    access.limits.receiver,
    "https://ilp.example.test/incoming-payments/ip-1",
    "un token filtrado no puede pagar a otro destino",
  );

  // El callback apunta a nuestro backend, con el id de la donación en la ruta.
  assert.equal(opGrant.args[1].interact.finish.uri, `${FINISH_BASE}/${row.id}`);
  assert.equal(opGrant.args[1].interact.finish.nonce, row.clientNonce);
  assert.equal(row.redirectUrl, "https://auth.example.test/interact/abc/123");
});

test("las credenciales nunca se guardan en claro", async () => {
  const { service, vault } = build();
  const { row } = await service.start(startArgs());

  assert.notEqual(row.continueToken, "continue-token");
  assert.equal(vault.open(row.continueToken), "continue-token");
  assert.notEqual(row.ipAccessToken, "token-incoming-payment");
  assert.equal(vault.open(row.ipAccessToken), "token-incoming-payment");

  // Y tampoco salen en la vista pública que recibe el frontend.
  const { toPublicDonation } = await import("../src/donations/views.js");
  const serializada = JSON.stringify(toPublicDonation(row));
  for (const secreto of ["continue-token", "token-incoming-payment", "nonce-del-as"]) {
    assert.ok(!serializada.includes(secreto), `se filtró ${secreto}`);
  }
  assert.ok(!serializada.includes(row.clientNonce), "se filtró el nonce del cliente");
});

test("dos peticiones con el mismo externalRef no cobran dos veces", async () => {
  const { service, client } = build();
  const primera = await service.start(startArgs());
  const segunda = await service.start(startArgs({ amount: "999" }));

  assert.equal(segunda.created, false);
  assert.equal(segunda.row.id, primera.row.id);
  assert.equal(called(client, "incomingPayment.create").length, 1, "un solo cobro creado");
  assert.equal(called(client, "quote.create").length, 1);
});

test("valida el monto antes de hablar con el proveedor", async () => {
  const { service, client } = build({ settings: { minAmount: "1", maxAmount: "100" } });

  for (const [args, patron] of [
    [{ amount: undefined }, /Falta el monto/],
    [{ amount: "0" }, /mayor que cero/],
    [{ amount: "0.50" }, /mínimo/],
    [{ amount: "500" }, /máximo/],
    [{ amount: "10.555" }, /decimales/],
    [{ amountMode: "otro" }, /amountMode/],
    [{ donorWalletAddress: "no es una url" }, /inválida/i],
    [{ donorWalletAddress: FUND.id }, /misma wallet/],
  ]) {
    await assert.rejects(
      () => service.start(startArgs({ externalRef: crypto.randomUUID(), ...args })),
      patron,
      `debería rechazar ${JSON.stringify(args)}`,
    );
  }

  assert.equal(
    called(client, "incomingPayment.create").length,
    0,
    "ninguna validación debe crear recursos",
  );
});

// ─── Mitad 2: el callback ────────────────────────────────────────────────────

test("el callback válido autoriza y crea el pago una sola vez", async () => {
  const { service, client, store } = build();
  const { row } = await service.start(startArgs());
  const interactRef = "ref-abc";

  const { row: despues, outcome } = await service.finishFromCallback({
    row,
    hash: hashFromAs(row, interactRef),
    interactRef,
    verifyHash: verifyInteractHash,
  });

  assert.equal(outcome, "sending");
  assert.equal(despues.status, "sending");
  assert.equal(despues.outgoingPaymentId, "https://ilp.example.test/outgoing-payments/op-1");

  const [cont] = called(client, "grant.continue");
  assert.equal(cont.args[0].url, "https://auth.example.test/continue/abc");
  assert.equal(cont.args[0].accessToken, "continue-token");
  assert.deepEqual(cont.args[1], { interact_ref: interactRef });

  const [outgoing] = called(client, "outgoingPayment.create");
  assert.equal(outgoing.args[0].url, DONOR.resourceServer, "el pago sale del RS del donante");
  assert.equal(outgoing.args[1].quoteId, "https://ilp.example.test/quotes/q-1");
  assert.equal(outgoing.args[1].metadata.externalRef, "ORD-1");

  // Recargar el callback (mismo o distinto interact_ref) no crea otro pago.
  const recarga = await service.finishFromCallback({
    row: await store.get(row.id),
    hash: hashFromAs(row, interactRef),
    interactRef,
    verifyHash: verifyInteractHash,
  });
  assert.equal(recarga.outcome, "already_processed");
  assert.equal(called(client, "outgoingPayment.create").length, 1, "un solo pago creado");
});

test("un callback con hash inválido no toca el grant", async () => {
  const { service, client } = build();
  const { row } = await service.start(startArgs());

  await assert.rejects(
    () =>
      service.finishFromCallback({
        row,
        hash: "hash-inventado",
        interactRef: "ref-abc",
        verifyHash: verifyInteractHash,
      }),
    (error) => error instanceof DonationError && error.status === 400,
  );

  assert.equal(called(client, "grant.continue").length, 0);
  assert.equal(called(client, "outgoingPayment.create").length, 0);
});

test("si el donante declina, la donación se cancela sin cobrar", async () => {
  const { service, client } = build();
  const { row } = await service.start(startArgs());

  const { row: despues, outcome } = await service.finishFromCallback({
    row,
    result: "grant_rejected",
    verifyHash: verifyInteractHash,
  });

  assert.equal(outcome, "rejected");
  assert.equal(despues.status, "cancelled");
  assert.match(despues.failureReason, /rechazó/);
  assert.equal(called(client, "outgoingPayment.create").length, 0);
  assert.equal(called(client, "grant.cancel").length, 1, "se libera el grant pendiente");
  assert.equal(called(client, "incomingPayment.complete").length, 1, "se cierra el cobro");
});

// ─── Confirmación y estado ───────────────────────────────────────────────────

test("modo polling: 401 del AS significa 'aún no consintió', no un fallo", async () => {
  const { OpenPaymentsClientError } = await import("@interledger/open-payments");
  let intentos = 0;
  const client = fakeClient({
    grant: {
      async continue(args, body) {
        intentos += 1;
        if (intentos === 1) {
          throw new OpenPaymentsClientError("sin consentir", { status: 401 });
        }
        return {
          access_token: { value: "token-outgoing-payment", manage: "m", expires_in: 600 },
        };
      },
    },
  });

  const { service } = build({ client, settings: { finishUrlBase: undefined } });
  const { row } = await service.start(startArgs());
  assert.equal(row.interactMode, "poll");
  assert.equal(row.asNonce, null, "sin finish no hay nonce del AS");

  const primera = await service.confirmPending(row.id);
  assert.equal(primera.outcome, "pending");
  assert.equal(primera.retryAfter, 4, "respeta el wait que indicó el AS");
  assert.equal(primera.row.status, "awaiting_consent");

  const segunda = await service.confirmPending(row.id);
  assert.equal(segunda.outcome, "sending");
  assert.equal(segunda.row.outgoingPaymentId, "https://ilp.example.test/outgoing-payments/op-1");
});

test("el estado no pasa a completada hasta que el envío llega", async () => {
  const client = fakeClient({
    outgoingPayment: {
      async get(args) {
        client.calls.push({ name: "outgoingPayment.get", args });
        return {
          id: args.url,
          debitAmount: { value: "1000", assetCode: "USD", assetScale: 2 },
          sentAmount: { value: "400", assetCode: "USD", assetScale: 2 },
          failed: false,
        };
      },
    },
  });

  const { service } = build({ client });
  const { row } = await service.start(startArgs());
  const interactRef = "ref-abc";
  await service.finishFromCallback({
    row,
    hash: hashFromAs(row, interactRef),
    interactRef,
    verifyHash: verifyInteractHash,
  });

  const parcial = await service.getStatus(row.id);
  assert.equal(parcial.status, "sending", "un envío parcial sigue en curso");
  assert.equal(parcial.sentAmount.value, "400");
  assert.equal(called(client, "incomingPayment.complete").length, 0, "el cobro sigue abierto");
});

test("cuando el envío termina se cierra el cobro y se revocan los tokens", async () => {
  const { service, client } = build();
  const { row } = await service.start(startArgs());
  const interactRef = "ref-abc";
  await service.finishFromCallback({
    row,
    hash: hashFromAs(row, interactRef),
    interactRef,
    verifyHash: verifyInteractHash,
  });

  const final = await service.getStatus(row.id);
  assert.equal(final.status, "completed");
  assert.equal(final.sentAmount.value, "1000");
  assert.equal(final.receivedAmount.value, "1000", "confirmado desde el lado del fondo");
  assert.equal(called(client, "incomingPayment.complete").length, 1);
  assert.equal(called(client, "token.revoke").length, 2, "token del pago y del cobro");
  assert.equal(final.opAccessToken, null, "los tokens revocados no se conservan");

  // Una consulta posterior no vuelve a llamar al proveedor: ya es terminal.
  const llamadas = client.calls.length;
  await service.getStatus(row.id);
  assert.equal(client.calls.length, llamadas);
});

test("un pago marcado como fallido por el proveedor queda en failed", async () => {
  const client = fakeClient({
    outgoingPayment: {
      async get(args) {
        client.calls.push({ name: "outgoingPayment.get", args });
        return {
          id: args.url,
          debitAmount: { value: "1000", assetCode: "USD", assetScale: 2 },
          sentAmount: { value: "0", assetCode: "USD", assetScale: 2 },
          failed: true,
        };
      },
    },
  });

  const { service } = build({ client });
  const { row } = await service.start(startArgs());
  const interactRef = "ref-abc";
  await service.finishFromCallback({
    row,
    hash: hashFromAs(row, interactRef),
    interactRef,
    verifyHash: verifyInteractHash,
  });

  const final = await service.getStatus(row.id);
  assert.equal(final.status, "failed");
  assert.match(final.failureReason, /fallido/);
});

test("un error de red al consultar no declara fallida la donación", async () => {
  const client = fakeClient({
    outgoingPayment: {
      async get() {
        throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
      },
    },
  });

  const { service } = build({ client });
  const { row } = await service.start(startArgs());
  const interactRef = "ref-abc";
  await service.finishFromCallback({
    row,
    hash: hashFromAs(row, interactRef),
    interactRef,
    verifyHash: verifyInteractHash,
  });

  const despues = await service.getStatus(row.id);
  assert.equal(despues.status, "sending", "no saber todavía no es fallar");
  assert.equal(despues.failureReason, null);
});

// ─── Cancelación y reanudación ───────────────────────────────────────────────

test("se puede cancelar antes del consentimiento, no después del envío", async () => {
  const { service, client } = build();
  const { row } = await service.start(startArgs());

  const cancelada = await service.cancel(row.id, "el donante se arrepintió");
  assert.equal(cancelada.status, "cancelled");
  assert.equal(called(client, "grant.cancel").length, 1);
  assert.equal(called(client, "incomingPayment.complete").length, 1);

  // Cancelar dos veces es inocuo.
  assert.equal((await service.cancel(row.id)).status, "cancelled");

  // Una donación ya enviada no se cancela: hay que consultar su estado.
  const otra = await service.start(startArgs({ externalRef: "ORD-2" }));
  const interactRef = "ref-2";
  await service.finishFromCallback({
    row: otra.row,
    hash: hashFromAs(otra.row, interactRef),
    interactRef,
    verifyHash: verifyInteractHash,
  });
  await assert.rejects(
    () => service.cancel(otra.row.id),
    (error) => error instanceof DonationError && error.status === 409,
  );
});

test("la reanudación crea el pago que quedó sin crear tras un reinicio", async () => {
  // Simula el peor caso: el grant se continuó y el proceso murió antes del POST.
  const client = fakeClient();
  const { service, store, vault } = build({ client });
  const { row } = await service.start(startArgs());
  await store.update(row.id, {
    status: "authorized",
    opAccessToken: vault.seal("token-outgoing-payment"),
    opTokenManage: "https://auth.example.test/token/outgoing",
    opTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    continueConsumed: true,
  });

  const resumen = await service.resumeAll();
  assert.equal(resumen.avanzadas, 1);
  assert.equal((await store.get(row.id)).status, "sending");
  assert.equal(called(client, "outgoingPayment.create").length, 1);
});

test("una cotización caducada sin consentimiento expira", async () => {
  const { service, store } = build();
  const { row } = await service.start(startArgs());
  await store.update(row.id, { quoteExpiresAt: new Date(Date.now() - 1000).toISOString() });

  const resumen = await service.resumeAll();
  assert.equal(resumen.expiradas, 1);
  assert.equal((await service.getStatus(row.id)).status, "expired");
});

test("un token que expiró antes del POST no intenta pagar", async () => {
  const client = fakeClient();
  const { service, store, vault } = build({ client });
  const { row } = await service.start(startArgs());
  await store.update(row.id, {
    status: "authorized",
    opAccessToken: vault.seal("token-outgoing-payment"),
    opTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
  });

  const despues = await service.getStatus(row.id);
  assert.equal(despues.status, "expired");
  assert.equal(called(client, "outgoingPayment.create").length, 0);
  assert.match(despues.failureReason, /expiró/);
});

test("si el proveedor rechaza el pago con 4xx no se reintenta", async () => {
  const { OpenPaymentsClientError } = await import("@interledger/open-payments");
  const client = fakeClient({
    outgoingPayment: {
      async create() {
        throw new OpenPaymentsClientError("quote expired", { status: 400 });
      },
    },
  });
  const { service, store } = build({ client });
  const { row } = await service.start(startArgs());
  const interactRef = "ref-abc";

  const { row: despues } = await service.finishFromCallback({
    row,
    hash: hashFromAs(row, interactRef),
    interactRef,
    verifyHash: verifyInteractHash,
  });
  assert.equal(despues.status, "failed", "un 4xx es terminal");

  // Y el job de reanudación no lo vuelve a intentar.
  const resumen = await service.resumeAll();
  assert.equal(resumen.revisadas, 0);
  assert.equal((await store.get(row.id)).status, "failed");
});

test("un 5xx deja la donación reintentable por el job de reanudación", async () => {
  const { OpenPaymentsClientError } = await import("@interledger/open-payments");
  let fallos = 1;
  const client = fakeClient({
    outgoingPayment: {
      async create(args, body) {
        if (fallos-- > 0) throw new OpenPaymentsClientError("mal día", { status: 503 });
        client.calls.push({ name: "outgoingPayment.create", args });
        return {
          id: "https://ilp.example.test/outgoing-payments/op-1",
          debitAmount: { value: "1000", assetCode: "USD", assetScale: 2 },
          sentAmount: { value: "0", assetCode: "USD", assetScale: 2 },
          failed: false,
        };
      },
    },
  });

  const { service, store } = build({ client });
  const { row } = await service.start(startArgs());
  const interactRef = "ref-abc";
  const { row: tras } = await service.finishFromCallback({
    row,
    hash: hashFromAs(row, interactRef),
    interactRef,
    verifyHash: verifyInteractHash,
  });

  assert.equal(tras.status, "authorized", "sigue autorizada, pendiente de reintento");
  await service.resumeAll();
  assert.equal((await store.get(row.id)).status, "sending");
});
