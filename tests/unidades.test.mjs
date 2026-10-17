/**
 * Pruebas de las piezas que, si se rompen, rompen dinero: normalización de
 * wallet addresses, aritmética de montos, el hash del callback, el cifrado de
 * tokens y el consumo único del continue token.
 *
 * No tocan la red: `node --test tests/` corre en cualquier máquina.
 */

import "./helpers/env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { toWalletAddressUrl, toAmount, formatAmount } = await import(
  "../src/open-payments/index.js"
);
const { verifyInteractHash } = await import("../src/donations/interact-hash.js");
const { createTokenVault } = await import("../src/donations/tokens.js");
const { createDonationStore } = await import("../src/donations/store.js");

// ─── Wallet addresses: es la entrada del usuario, llega de todo ──────────────

test("normaliza las formas en que una persona escribe su wallet address", () => {
  const canonical = "https://ilp.example.test/alice";
  assert.equal(toWalletAddressUrl("https://ilp.example.test/alice"), canonical);
  assert.equal(toWalletAddressUrl("  https://ilp.example.test/alice/  "), canonical);
  assert.equal(toWalletAddressUrl("ilp.example.test/alice"), canonical);
  assert.equal(toWalletAddressUrl("$ilp.example.test/alice"), canonical);
  // Un payment pointer sin ruta apunta al recurso por defecto del host.
  assert.equal(
    toWalletAddressUrl("$ilp.example.test"),
    "https://ilp.example.test/.well-known/pay",
  );
});

test("rechaza wallet addresses que no se pueden usar", () => {
  for (const malo of ["", "   ", "no es una url", "https://ilp.test/a?x=1", "https://ilp.test/a#f"]) {
    assert.throws(() => toWalletAddressUrl(malo), /wallet address/i, `debería fallar: "${malo}"`);
  }
  // Mezclar https:// con el "$" del payment pointer deja el sigilo dentro del
  // host: la dirección no resuelve y el fallo aparece tarde, al cobrar.
  assert.throws(
    () => toWalletAddressUrl("https://$ilp.example.test/alice"),
    /mezcla las dos notaciones/,
  );

  // http:// solo con un Rafiki local y OP_USE_HTTP=true.
  assert.throws(() => toWalletAddressUrl("http://ilp.test/a"), /https/);
  assert.equal(
    toWalletAddressUrl("http://localhost:3000/a", { allowHttp: true }),
    "http://localhost:3000/a",
  );
});

// ─── Montos: un float aquí es un bug de dinero ───────────────────────────────

test("convierte montos humanos a la escala del activo", () => {
  const usd = { assetCode: "USD", assetScale: 2 };
  assert.deepEqual(toAmount("10", usd), { value: "1000", assetCode: "USD", assetScale: 2 });
  assert.equal(toAmount("10.50", usd).value, "1050");
  assert.equal(toAmount("0.05", usd).value, "5");
  assert.equal(toAmount("10,50", usd).value, "1050", "acepta coma decimal");
  // Escalas distintas de 2 existen y hay que respetarlas.
  assert.equal(toAmount("10", { assetCode: "JPY", assetScale: 0 }).value, "10");
  assert.equal(toAmount("1.5", { assetCode: "XRP", assetScale: 9 }).value, "1500000000");
});

test("rechaza montos con más decimales de los que admite la moneda", () => {
  assert.throws(() => toAmount("10.555", { assetCode: "USD", assetScale: 2 }), /decimales/);
  assert.throws(() => toAmount("-5", { assetCode: "USD", assetScale: 2 }), /inválido/i);
  assert.throws(() => toAmount("abc", { assetCode: "USD", assetScale: 2 }), /inválido/i);
});

test("formatea montos sin pasar por coma flotante", () => {
  assert.equal(formatAmount({ value: "1000", assetScale: 2, assetCode: "USD" }), "10.00 USD");
  assert.equal(formatAmount({ value: "5", assetScale: 2, assetCode: "USD" }), "0.05 USD");
  assert.equal(formatAmount({ value: "10", assetScale: 0, assetCode: "JPY" }), "10 JPY");
  // Un valor que no cabe en un Number sigue siendo exacto.
  assert.equal(
    formatAmount({ value: "90071992547409910", assetScale: 2, assetCode: "USD" }),
    "900719925474099.10 USD",
  );
});

// ─── El hash del callback es un control de seguridad ─────────────────────────

const hashArgs = {
  clientNonce: "nonce-cliente",
  asNonce: "nonce-as",
  interactRef: "ref-123",
  grantEndpoint: "https://auth.example.test",
};

const hashFor = (args, { trailingNewline = false } = {}) => {
  const base = `${args.clientNonce}\n${args.asNonce}\n${args.interactRef}\n${args.grantEndpoint}`;
  return crypto
    .createHash("sha256")
    .update(trailingNewline ? `${base}\n` : base)
    .digest("base64url");
};

test("acepta el hash correcto, con y sin salto de línea final", () => {
  assert.ok(verifyInteractHash({ ...hashArgs, hash: hashFor(hashArgs) }));
  assert.ok(
    verifyInteractHash({ ...hashArgs, hash: hashFor(hashArgs, { trailingNewline: true }) }),
  );
  // base64 estándar en vez de base64url: el AS puede enviarlo así.
  const b64 = Buffer.from(hashFor(hashArgs), "base64url").toString("base64");
  assert.ok(verifyInteractHash({ ...hashArgs, hash: b64 }));
});

test("rechaza cualquier callback que no venga del authorization server", () => {
  const valido = hashFor(hashArgs);
  assert.equal(verifyInteractHash({ ...hashArgs, hash: undefined }), false, "sin hash");
  assert.equal(verifyInteractHash({ ...hashArgs, hash: "" }), false, "hash vacío");
  assert.equal(verifyInteractHash({ ...hashArgs, hash: "no-es-un-hash" }), false);
  assert.equal(
    verifyInteractHash({ ...hashArgs, interactRef: undefined, hash: valido }),
    false,
    "sin interact_ref",
  );
  // Cambiar cualquiera de los cuatro ingredientes invalida el hash.
  for (const campo of ["clientNonce", "asNonce", "interactRef", "grantEndpoint"]) {
    assert.equal(
      verifyInteractHash({ ...hashArgs, [campo]: "otro-valor", hash: valido }),
      false,
      `debería rechazar con ${campo} distinto`,
    );
  }
});

// ─── Credenciales en reposo ──────────────────────────────────────────────────

test("cifra y descifra los tokens, y detecta manipulación", () => {
  const vault = createTokenVault("un-secreto-de-pruebas");
  const sellado = vault.seal("continue-token-secreto");

  assert.notEqual(sellado, "continue-token-secreto", "no debe guardarse en claro");
  assert.equal(vault.open(sellado), "continue-token-secreto");
  assert.equal(vault.open(null), null);
  assert.equal(vault.seal(null), null);

  // Dos cifrados del mismo valor no coinciden (IV aleatorio).
  assert.notEqual(vault.seal("x"), vault.seal("x"));

  // Un byte cambiado en el ciphertext hace fallar la autenticación GCM.
  const buffer = Buffer.from(sellado, "base64");
  buffer[buffer.length - 1] ^= 0xff;
  assert.throws(() => vault.open(buffer.toString("base64")));

  // Otro secreto no puede abrirlo.
  assert.throws(() => createTokenVault("otro-secreto").open(sellado));
});

// ─── Store: idempotencia y consumo único ─────────────────────────────────────

const fila = (overrides = {}) => ({
  id: crypto.randomUUID(),
  externalRef: "ORD-1",
  status: "awaiting_consent",
  continueConsumed: false,
  ...overrides,
});

test("el mismo externalRef no abre una segunda donación", async () => {
  const store = createDonationStore();
  const primera = await store.create(fila());
  const segunda = await store.create(fila({ externalRef: "ORD-1" }));

  assert.equal(primera.created, true);
  assert.equal(segunda.created, false, "el reintento no crea otra donación");
  assert.equal(segunda.row.id, primera.row.id);
  assert.equal((await store.list()).length, 1);
});

test("el continue token se consume una sola vez", async () => {
  const store = createDonationStore();
  const { row } = await store.create(fila());

  assert.equal(await store.claimContinue(row.id), true, "primer callback");
  assert.equal(await store.claimContinue(row.id), false, "recarga del navegador");
  assert.equal(await store.claimContinue("id-que-no-existe"), false);
});

test("solo son reanudables las donaciones que pueden avanzar", async () => {
  const store = createDonationStore();
  for (const status of [
    "awaiting_consent",
    "authorized",
    "sending",
    "completed",
    "failed",
    "expired",
    "cancelled",
  ]) {
    await store.create(fila({ externalRef: status, status }));
  }
  const reanudables = (await store.resumable()).map((row) => row.status).sort();
  assert.deepEqual(reanudables, ["authorized", "awaiting_consent", "sending"]);
  assert.equal((await store.countByStatus()).completed, 1);
});
