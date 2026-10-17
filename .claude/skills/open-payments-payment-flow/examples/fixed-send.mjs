/**
 * Fixed-send: el emisor fija cuánto sale de su cuenta y el receptor recibe
 * lo que llegue después de comisiones y conversión. Caso típico de propinas,
 * donaciones y remesas.
 *
 * Diferencias con fixed-receive:
 *   - el incoming payment se crea SIN incomingAmount
 *   - la quote lleva debitAmount
 *   - al final se completa el incoming payment para cerrarlo
 *
 * Uso: node fixed-send.mjs
 */
import {
  createAuthenticatedClient,
  isFinalizedGrant,
  OpenPaymentsClientError,
} from "@interledger/open-payments";
import readline from "node:readline/promises";

const env = (n, d) => {
  const v = process.env[n] ?? d;
  if (!v) throw new Error(`Falta la variable de entorno ${n}`);
  return v;
};
const fmt = (a) =>
  `${(Number(BigInt(a.value)) / 10 ** a.assetScale).toFixed(a.assetScale)} ${a.assetCode}`;

const main = async () => {
  const client = await createAuthenticatedClient({
    walletAddressUrl: env("OP_CLIENT_WALLET_ADDRESS"),
    privateKey: process.env.OP_PRIVATE_KEY_PATH ?? "private.key",
    keyId: env("OP_KEY_ID"),
  });

  const [sender, receiver] = await Promise.all([
    client.walletAddress.get({ url: env("OP_SENDER_WALLET_ADDRESS") }),
    client.walletAddress.get({ url: env("OP_RECEIVER_WALLET_ADDRESS") }),
  ]);

  // Grant + incoming payment ABIERTO (sin incomingAmount)
  const ipGrant = await client.grant.request(
    { url: receiver.authServer },
    { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read", "complete"] }] } },
  );
  if (!isFinalizedGrant(ipGrant)) throw new Error("Grant de incoming-payment no finalizado");
  const ipToken = ipGrant.access_token.value;

  const incomingPayment = await client.incomingPayment.create(
    { url: receiver.resourceServer, accessToken: ipToken },
    {
      walletAddress: receiver.id,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      metadata: { description: "Propina" },
    },
  );
  console.log(`Incoming payment abierto: ${incomingPayment.id}`);

  // Quote con debitAmount: el emisor fija lo que sale de SU cuenta
  const quoteGrant = await client.grant.request(
    { url: sender.authServer },
    { access_token: { access: [{ type: "quote", actions: ["create", "read"] }] } },
  );
  if (!isFinalizedGrant(quoteGrant)) throw new Error("Grant de quote no finalizado");

  const quote = await client.quote.create(
    { url: sender.resourceServer, accessToken: quoteGrant.access_token.value },
    {
      walletAddress: sender.id,
      receiver: incomingPayment.id,
      method: "ilp",
      debitAmount: {
        assetCode: sender.assetCode,
        assetScale: sender.assetScale,
        value: process.env.OP_AMOUNT ?? "1000",
      },
    },
  );
  console.log(`Saldrán ${fmt(quote.debitAmount)} y llegarán ${fmt(quote.receiveAmount)}`);

  // Grant interactivo
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
  console.log(`\nAutoriza en: ${pending.interact.redirect}\n`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Enter cuando hayas aceptado… ");
  rl.close();

  const finalized = await client.grant.continue({
    url: pending.continue.uri,
    accessToken: pending.continue.access_token.value,
  });
  if (!isFinalizedGrant(finalized)) throw new Error("La autorización no se completó");

  const op = await client.outgoingPayment.create(
    { url: sender.resourceServer, accessToken: finalized.access_token.value },
    { walletAddress: sender.id, quoteId: quote.id },
  );
  console.log(`Outgoing payment: ${op.id}`);

  // Confirmar desde el lado del receptor y cerrar el incoming payment
  let ip = incomingPayment;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    ip = await client.incomingPayment.get({ url: incomingPayment.id, accessToken: ipToken });
    if (BigInt(ip.receivedAmount.value) > 0n) break;
  }
  console.log(`Recibido: ${fmt(ip.receivedAmount)}`);

  // Cerrar: un incoming payment abierto seguiría aceptando fondos
  const completed = await client.incomingPayment.complete({
    url: incomingPayment.id,
    accessToken: ipToken,
  });
  console.log(`Incoming payment cerrado: completed=${completed.completed}`);
};

main().catch((err) => {
  if (err instanceof OpenPaymentsClientError) {
    console.error(`OpenPaymentsClientError ${err.status}: ${err.description}`);
  } else console.error(err);
  process.exit(1);
});
