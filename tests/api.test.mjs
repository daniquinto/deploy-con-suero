/**
 * Pruebas de la API HTTP: los códigos de estado, el contrato que ve el
 * frontend y el callback del navegador. Levanta la app de verdad en un puerto
 * efímero, con el cliente de Open Payments falso: no sale a la red.
 */

import "./helpers/env.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { fakeClient, fakeResolver, DONOR, FUND } from "./helpers/env.mjs";

const { createDonationService } = await import("../src/donations/flow.js");
const { createDonationStore } = await import("../src/donations/store.js");
const { createTokenVault } = await import("../src/donations/tokens.js");
const { createApp } = await import("../src/http/app.js");
const { config } = await import("../src/open-payments/index.js");

let server;
let base;
let client;
let store;

before(async () => {
  client = fakeClient();
  store = createDonationStore();
  const service = createDonationService({
    client,
    store,
    vault: createTokenVault("secreto-de-pruebas"),
    resolveWallet: fakeResolver(),
    settings: { fundWalletAddress: FUND.id, finishUrlBase: config.interact.finishUrl },
  });

  const app = createApp({ service, store });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

const post = (path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Inicia una donación y devuelve la vista pública. */
async function donar(overrides = {}) {
  const response = await post("/api/donations", {
    donorWalletAddress: DONOR.id,
    amount: "10",
    externalRef: crypto.randomUUID(),
    ...overrides,
  });
  return { response, body: await response.json() };
}

test("GET /healthz no toca la red y responde ok", async () => {
  const response = await fetch(`${base}/healthz`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test("GET /api/fund dice a dónde va el dinero y con qué límites", async () => {
  const response = await fetch(`${base}/api/fund`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.walletAddress, FUND.id);
  assert.equal(body.assetCode, "USD");
  assert.equal(body.assetScale, 2);
  assert.equal(body.consentMode, "finish");
  assert.ok(Array.isArray(body.suggestedAmounts));
});

test("POST /api/wallet/connect valida la wallet del donante", async () => {
  const ok = await post("/api/wallet/connect", { walletAddress: DONOR.id });
  const body = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.donor.assetCode, "USD");
  assert.equal(body.sameAsset, true);
  assert.equal(body.fund.walletAddress, FUND.id);

  const desconocida = await post("/api/wallet/connect", {
    walletAddress: "https://ilp.example.test/nadie",
  });
  assert.equal(desconocida.status, 422, "una wallet que no resuelve no es un 500");
  assert.equal((await desconocida.json()).ok, false);

  const vacia = await post("/api/wallet/connect", {});
  assert.equal(vacia.status, 400);
  assert.equal((await vacia.json()).error.code, "DONATION_WALLET_REQUIRED");
});

test("POST /api/donations devuelve todo lo que el frontend necesita", async () => {
  const { response, body } = await donar();

  assert.equal(response.status, 201);
  assert.equal(body.status, "awaiting_consent");
  assert.ok(body.donationId);

  // A dónde mandar al donante y qué se le va a cobrar.
  assert.match(body.interact.redirectUrl, /^https:\/\/auth\.example\.test\/interact/);
  assert.equal(body.interact.mode, "finish");
  assert.equal(body.amounts.debit.formatted, "10.00 USD");
  assert.equal(body.amounts.receive.formatted, "9.70 USD");
  assert.equal(body.amounts.mode, "send");
  assert.equal(body.fund.walletAddress, FUND.id);
  assert.equal(body.donor.walletAddress, DONOR.id);
  assert.ok(body.resources.incomingPaymentId);
  assert.ok(body.resources.quoteId);
  assert.equal(body.links.status, `/api/donations/${body.donationId}`);
  assert.ok(body.nextStep);

  // Y nada de lo que es secreto.
  const texto = JSON.stringify(body);
  for (const prohibido of ["continue-token", "token-incoming-payment", "continueUri", "nonce"]) {
    assert.ok(!texto.includes(prohibido), `la respuesta filtra ${prohibido}`);
  }
});

test("la cabecera Idempotency-Key evita una segunda donación", async () => {
  const key = crypto.randomUUID();
  const primera = await post(
    "/api/donations",
    { donorWalletAddress: DONOR.id, amount: "10" },
    { "Idempotency-Key": key },
  );
  const segunda = await post(
    "/api/donations",
    { donorWalletAddress: DONOR.id, amount: "10" },
    { "Idempotency-Key": key },
  );

  assert.equal(primera.status, 201, "la primera crea");
  assert.equal(segunda.status, 200, "la segunda devuelve la misma, no crea otra");
  assert.equal((await primera.json()).donationId, (await segunda.json()).donationId);
});

test("un monto inválido es 400 con un código de error utilizable", async () => {
  const { response, body } = await donar({ amount: "-3" });
  assert.equal(response.status, 400);
  assert.equal(body.error.code, "DONATION_INVALID_AMOUNT");
  assert.ok(body.error.message);
});

test("un JSON roto es 400, no un 500", async () => {
  const response = await fetch(`${base}/api/donations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{no es json",
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "BAD_JSON");
});

test("el callback del authorization server completa el flujo", async () => {
  const { body } = await donar();
  const row = await store.get(body.donationId);
  const interactRef = "ref-http";
  const hash = crypto
    .createHash("sha256")
    .update(`${row.clientNonce}\n${row.asNonce}\n${interactRef}\n${row.authServer}`)
    .digest("base64url");

  const response = await fetch(
    `${base}/op/callback/${body.donationId}?hash=${encodeURIComponent(hash)}` +
      `&interact_ref=${interactRef}`,
    { redirect: "manual" },
  );

  // Sin FRONTEND_URL se le muestra una página al donante; con él, un 302.
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /html/);
  assert.match(await response.text(), /camino|Gracias/i);

  const estado = await fetch(`${base}/api/donations/${body.donationId}`);
  const final = await estado.json();
  assert.equal(final.status, "completed", "el polling confirma el envío");
  assert.equal(final.amounts.sent.formatted, "10.00 USD");
  assert.equal(final.interact, undefined, "ya no hay nada que autorizar");
});

test("un callback con hash inválido no avanza la donación", async () => {
  const { body } = await donar();
  const response = await fetch(
    `${base}/op/callback/${body.donationId}?hash=falso&interact_ref=x`,
    { redirect: "manual" },
  );

  assert.equal(response.status, 400);
  const estado = await (await fetch(`${base}/api/donations/${body.donationId}`)).json();
  assert.equal(estado.status, "awaiting_consent", "sigue esperando consentimiento");
});

test("un callback para una donación inexistente no revela nada", async () => {
  const response = await fetch(`${base}/op/callback/${crypto.randomUUID()}?hash=x&interact_ref=y`, {
    redirect: "manual",
  });
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /html/);
});

test("cancelar devuelve la donación cancelada; una inexistente es 404", async () => {
  const { body } = await donar();
  const response = await post(`/api/donations/${body.donationId}/cancel`, {
    reason: "el donante cambió de idea",
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "cancelled");

  const inexistente = await post(`/api/donations/${crypto.randomUUID()}/cancel`, {});
  assert.equal(inexistente.status, 404);
  assert.equal((await inexistente.json()).error.code, "DONATION_NOT_FOUND");
});

test("se puede cerrar la donación pasando los parámetros del redirect", async () => {
  // El caso real: el AS mandó al donante a un dominio que no es el backend
  // (PUBLIC_BASE_URL equivocada), o una app móvil intercepta su deep link.
  const { body } = await donar();
  const row = await store.get(body.donationId);
  const interactRef = "ref-rescatado";
  const hash = crypto
    .createHash("sha256")
    .update(`${row.clientNonce}\n${row.asNonce}\n${interactRef}\n${row.authServer}`)
    .digest("base64url");

  const response = await post(`/api/donations/${body.donationId}/confirm`, {
    hash,
    interact_ref: interactRef,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "sending");

  // Reenviarlo no crea un segundo pago.
  const repetido = await post(`/api/donations/${body.donationId}/confirm`, {
    hash,
    interact_ref: interactRef,
  });
  assert.equal(repetido.status, 200);
  assert.notEqual((await repetido.json()).status, "failed");
});

test("un rescate con hash inválido se rechaza igual que el callback", async () => {
  const { body } = await donar();
  const response = await post(`/api/donations/${body.donationId}/confirm`, {
    hash: "falso",
    interact_ref: "x",
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "DONATION_BAD_INTERACT_HASH");
});

test("confirmar una donación que usa callback es 409", async () => {
  const { body } = await donar();
  const response = await post(`/api/donations/${body.donationId}/confirm`, {});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "DONATION_WRONG_INTERACT_MODE");
});

test("una ruta que no existe es 404 en JSON", async () => {
  const response = await fetch(`${base}/api/lo-que-sea`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "NOT_FOUND");
});
