/**
 * Prueba e2e semi-automatica del flujo completo.
 *
 * Automatico: incoming payment, quote, grant pendiente, continuacion por polling,
 * outgoing payment y confirmacion, con assertions en cada paso.
 * Manual: aceptar la autorizacion en el navegador (es interactiva por diseño).
 *
 * Uso: node e2e-flow.mjs
 *      E2E_CONSENT_TIMEOUT_MS=180000 node e2e-flow.mjs
 */
import assert from "node:assert/strict";
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
const CONSENT_TIMEOUT = Number(process.env.E2E_CONSENT_TIMEOUT_MS ?? 120_000);
const AMOUNT = process.env.OP_AMOUNT ?? "100";

const client = await createAuthenticatedClient({
  walletAddressUrl: env("OP_CLIENT_WALLET_ADDRESS"),
  privateKey: process.env.OP_PRIVATE_KEY_PATH ?? "private.key",
  keyId: env("OP_KEY_ID"),
  validateResponses: true,
});

const [sender, receiver] = await Promise.all([
  client.walletAddress.get({ url: env("OP_SENDER_WALLET_ADDRESS") }),
  client.walletAddress.get({ url: env("OP_RECEIVER_WALLET_ADDRESS") }),
]);
assert.ok(sender.authServer && sender.resourceServer, "el emisor expone sus servidores");
assert.ok(receiver.authServer && receiver.resourceServer, "el receptor expone sus servidores");
console.log("✓ descubrimiento");

// ── incoming payment ─────────────────────────────────────────────────────────
const ipGrant = await client.grant.request(
  { url: receiver.authServer },
  { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read", "complete"] }] } },
);
assert.ok(isFinalizedGrant(ipGrant), "el grant de incoming-payment es no interactivo");
const ipToken = ipGrant.access_token.value;

const externalRef = `e2e-${Date.now()}`;
const incomingPayment = await client.incomingPayment.create(
  { url: receiver.resourceServer, accessToken: ipToken },
  {
    walletAddress: receiver.id,
    incomingAmount: { assetCode: receiver.assetCode, assetScale: receiver.assetScale, value: AMOUNT },
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    metadata: { description: "e2e", externalRef },
  },
);
assert.equal(incomingPayment.completed, false);
assert.equal(incomingPayment.receivedAmount.value, "0", "recien creado no ha recibido nada");
assert.equal(incomingPayment.incomingAmount.value, AMOUNT);
console.log(`✓ incoming payment ${incomingPayment.id}`);

// ── quote: lado del EMISOR ───────────────────────────────────────────────────
const quoteGrant = await client.grant.request(
  { url: sender.authServer },
  { access_token: { access: [{ type: "quote", actions: ["create", "read"] }] } },
);
assert.ok(isFinalizedGrant(quoteGrant), "el grant de quote es no interactivo");

const quote = await client.quote.create(
  { url: sender.resourceServer, accessToken: quoteGrant.access_token.value },
  { walletAddress: sender.id, receiver: incomingPayment.id, method: "ilp" },
);
assert.equal(quote.receiver, incomingPayment.id);
assert.equal(quote.walletAddress, sender.id, "la quote pertenece al EMISOR");
assert.ok(BigInt(quote.debitAmount.value) > 0n);
assert.ok(new Date(quote.expiresAt) > new Date(), "la quote esta vigente");
console.log(`✓ quote ${quote.id} (debita ${quote.debitAmount.value}, entrega ${quote.receiveAmount.value})`);

// ── grant interactivo ────────────────────────────────────────────────────────
const pending = await client.grant.request(
  { url: sender.authServer },
  {
    access_token: {
      access: [{
        type: "outgoing-payment",
        actions: ["create", "read"],
        identifier: sender.id,
        limits: { debitAmount: quote.debitAmount, receiver: incomingPayment.id },
      }],
    },
    interact: { start: ["redirect"] },
  },
);
assert.ok(isPendingGrant(pending), "el grant de outgoing-payment SI requiere interaccion");
assert.ok(pending.interact.redirect, "trae URL de interaccion");
assert.ok(pending.continue.uri && pending.continue.access_token.value, "trae datos de continuacion");

console.log(`\n→ Acepta la autorizacion aqui (tienes ${CONSENT_TIMEOUT / 1000}s):`);
console.log(`  ${pending.interact.redirect}\n`);

// ── polling de la continuacion ───────────────────────────────────────────────
const deadline = Date.now() + CONSENT_TIMEOUT;
let delay = (pending.continue.wait ?? 5) * 1000;
let finalized = null;
while (Date.now() < deadline && !finalized) {
  await new Promise((r) => setTimeout(r, delay));
  try {
    const g = await client.grant.continue({
      url: pending.continue.uri,
      accessToken: pending.continue.access_token.value,
    });
    if (isFinalizedGrant(g)) finalized = g;
  } catch (err) {
    // 401 = aun sin consentir. Cualquier otro codigo es un fallo real.
    if (!(err instanceof OpenPaymentsClientError) || err.status !== 401) throw err;
    process.stdout.write(".");
  }
  delay = Math.min(delay * 2, 15_000);
}
assert.ok(finalized, `nadie consintio en ${CONSENT_TIMEOUT / 1000}s`);
console.log("\n✓ grant finalizado");

// ── outgoing payment ─────────────────────────────────────────────────────────
const opToken = finalized.access_token.value;
const op = await client.outgoingPayment.create(
  { url: sender.resourceServer, accessToken: opToken },
  { walletAddress: sender.id, quoteId: quote.id, metadata: { externalRef } },
);
assert.equal(op.quoteId, quote.id);
assert.equal(op.failed, false);
assert.equal(op.sentAmount.value, "0", "el envio ILP es asincrono: aun no ha salido nada");
console.log(`✓ outgoing payment ${op.id}`);

// ── confirmacion ─────────────────────────────────────────────────────────────
let last = op, confirmed = false;
const confirmDeadline = Date.now() + 60_000;
let d = 1000;
while (Date.now() < confirmDeadline) {
  await new Promise((r) => setTimeout(r, d));
  d = Math.min(d * 2, 5000);
  last = await client.outgoingPayment.get({ url: op.id, accessToken: opToken });
  assert.equal(last.failed, false, `el pago fallo (enviado ${last.sentAmount.value})`);
  if (BigInt(last.sentAmount.value) >= BigInt(last.debitAmount.value)) { confirmed = true; break; }
}
assert.ok(confirmed, "timeout de confirmacion: sigue en curso, NO lo trates como fallo");

const ip = await client.incomingPayment.get({ url: incomingPayment.id, accessToken: ipToken });
assert.ok(BigInt(ip.receivedAmount.value) > 0n, "el receptor registro la recepcion");
console.log(`✓ confirmado: debitado ${last.sentAmount.value}, recibido ${ip.receivedAmount.value}`);

// ── limpieza ─────────────────────────────────────────────────────────────────
await Promise.allSettled([
  client.token.revoke({ url: finalized.access_token.manage, accessToken: opToken }),
  client.token.revoke({ url: ipGrant.access_token.manage, accessToken: ipToken }),
]);
console.log("\n✓ e2e completo");
