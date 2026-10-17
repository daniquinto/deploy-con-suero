/**
 * Flujo completo de Open Payments: incoming payment -> quote -> outgoing payment.
 * Modalidad fixed-receive: el receptor recibe un monto exacto.
 *
 * Requiere (vía variables de entorno):
 *   OP_CLIENT_WALLET_ADDRESS    wallet address del CLIENTE (la que firma)
 *   OP_KEY_ID                   key id de la llave registrada en esa wallet address
 *   OP_PRIVATE_KEY_PATH         ruta al PEM Ed25519 (default: private.key)
 *   OP_SENDER_WALLET_ADDRESS    wallet address del emisor
 *   OP_RECEIVER_WALLET_ADDRESS  wallet address del receptor
 *   OP_AMOUNT                   monto entero en la escala del receptor (default: 1000)
 *
 * Uso: node peer-to-peer.mjs
 */
import {
  createAuthenticatedClient,
  isFinalizedGrant,
  isPendingGrant,
  OpenPaymentsClientError,
} from "@interledger/open-payments";
import readline from "node:readline/promises";

const env = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
};

const fmt = (a) =>
  `${(Number(BigInt(a.value)) / 10 ** a.assetScale).toFixed(a.assetScale)} ${a.assetCode}`;

const main = async () => {
  const client = await createAuthenticatedClient({
    walletAddressUrl: env("OP_CLIENT_WALLET_ADDRESS"),
    privateKey: process.env.OP_PRIVATE_KEY_PATH ?? "private.key",
    keyId: env("OP_KEY_ID"),
    validateResponses: true,
  });

  // ── 1. Descubrimiento (público) ────────────────────────────────────────────
  const [sender, receiver] = await Promise.all([
    client.walletAddress.get({ url: env("OP_SENDER_WALLET_ADDRESS") }),
    client.walletAddress.get({ url: env("OP_RECEIVER_WALLET_ADDRESS") }),
  ]);

  console.log("1. Wallet addresses resueltas");
  console.log(`   emisor:   ${sender.id} (${sender.assetCode}, escala ${sender.assetScale})`);
  console.log(`   receptor: ${receiver.id} (${receiver.assetCode}, escala ${receiver.assetScale})`);
  if (sender.assetCode !== receiver.assetCode) {
    console.log(`   ⚠ habrá conversión ${sender.assetCode} → ${receiver.assetCode}`);
  }

  // ── 2. Grant de incoming payment: AS DEL RECEPTOR, no interactivo ──────────
  const ipGrant = await client.grant.request(
    { url: receiver.authServer },
    {
      access_token: {
        access: [{ type: "incoming-payment", actions: ["create", "read", "complete"] }],
      },
    },
  );
  if (!isFinalizedGrant(ipGrant)) {
    throw new Error("El grant de incoming-payment debería finalizarse sin interacción");
  }
  const ipToken = ipGrant.access_token.value;
  console.log("2. Grant de incoming payment obtenido");

  // ── 3. Incoming payment: RS DEL RECEPTOR ───────────────────────────────────
  const incomingPayment = await client.incomingPayment.create(
    { url: receiver.resourceServer, accessToken: ipToken },
    {
      walletAddress: receiver.id,
      incomingAmount: {
        assetCode: receiver.assetCode,
        assetScale: receiver.assetScale,
        value: process.env.OP_AMOUNT ?? "1000",
      },
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      metadata: { description: "Pago de ejemplo", externalRef: `demo-${Date.now()}` },
    },
  );
  console.log(`3. Incoming payment creado: ${incomingPayment.id}`);
  console.log(`   esperando ${fmt(incomingPayment.incomingAmount)}`);

  // ── 4. Grant de quote: AS DEL EMISOR, no interactivo ───────────────────────
  const quoteGrant = await client.grant.request(
    { url: sender.authServer },
    { access_token: { access: [{ type: "quote", actions: ["create", "read"] }] } },
  );
  if (!isFinalizedGrant(quoteGrant)) {
    throw new Error("El grant de quote debería finalizarse sin interacción");
  }
  console.log("4. Grant de quote obtenido");

  // ── 5. Quote: RS DEL EMISOR, apuntando al incoming payment del receptor ────
  const quote = await client.quote.create(
    { url: sender.resourceServer, accessToken: quoteGrant.access_token.value },
    { walletAddress: sender.id, receiver: incomingPayment.id, method: "ilp" },
  );
  console.log(`5. Quote creada: ${quote.id}`);
  console.log(`   se debita ${fmt(quote.debitAmount)} para entregar ${fmt(quote.receiveAmount)}`);
  console.log(`   expira: ${quote.expiresAt}`);

  // ── 6. Grant interactivo de outgoing payment: AS DEL EMISOR ────────────────
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
  if (!isPendingGrant(pending)) {
    throw new Error("El grant de outgoing-payment debería requerir interacción");
  }

  console.log("\n6. Autoriza el pago en esta URL:");
  console.log(`   ${pending.interact.redirect}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("   Pulsa Enter cuando hayas aceptado la autorización… ");
  rl.close();

  // ── 7. Continuar el grant ──────────────────────────────────────────────────
  let finalized;
  try {
    finalized = await client.grant.continue({
      url: pending.continue.uri,
      accessToken: pending.continue.access_token.value,
    });
  } catch (err) {
    if (err instanceof OpenPaymentsClientError) {
      console.error(
        `\nNo se pudo continuar el grant (HTTP ${err.status}): ${err.description}\n` +
        "Causas típicas: no aceptaste la autorización, el grant expiró, o este " +
        "continue token ya se usó (en ese caso hay que reiniciar el flujo).",
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  if (!isFinalizedGrant(finalized)) {
    console.error("\nEl grant sigue pendiente: la autorización no se completó.");
    process.exitCode = 1;
    return;
  }
  const opToken = finalized.access_token.value;
  console.log("7. Grant de outgoing payment finalizado");

  // ── 8. Outgoing payment: RS DEL EMISOR ─────────────────────────────────────
  const outgoingPayment = await client.outgoingPayment.create(
    { url: sender.resourceServer, accessToken: opToken },
    {
      walletAddress: sender.id,
      quoteId: quote.id,
      metadata: { externalRef: incomingPayment.metadata?.externalRef },
    },
  );
  console.log(`8. Outgoing payment creado: ${outgoingPayment.id}`);

  // ── 9. Confirmación: el envío es asíncrono ─────────────────────────────────
  const deadline = Date.now() + 60_000;
  let delay = 1000;
  let last = outgoingPayment;
  while (Date.now() < deadline) {
    if (last.failed) {
      console.error(`9. El pago falló. Enviado: ${fmt(last.sentAmount)}`);
      process.exitCode = 1;
      return;
    }
    if (BigInt(last.sentAmount.value) >= BigInt(last.debitAmount.value)) {
      console.log(`9. Pago completado. Debitado ${fmt(last.sentAmount)}.`);
      return;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 5000);
    last = await client.outgoingPayment.get({ url: outgoingPayment.id, accessToken: opToken });
  }
  // Timeout != fallo. Sigue en curso; reconsultar más tarde.
  console.log(`9. Sigue en curso. Enviado hasta ahora: ${fmt(last.sentAmount)}`);
};

main().catch((err) => {
  if (err instanceof OpenPaymentsClientError) {
    console.error(`\nOpenPaymentsClientError ${err.status}: ${err.description}`);
    if (err.validationErrors) console.error(err.validationErrors);
  } else {
    console.error(err);
  }
  process.exit(1);
});
