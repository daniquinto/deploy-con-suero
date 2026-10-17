/**
 * Solo cobrar: genera un link de cobro con un único grant (el del receptor).
 * No se toca nada del emisor: quien pague usa su propia app o billetera.
 *
 * Es el patrón de las "payment requests" y el más simple para integrar cobros
 * en un e-commerce cuando el pagador autoriza desde su propia billetera.
 *
 * Uso: node receive-only.mjs
 */
import {
  createAuthenticatedClient,
  createUnauthenticatedClient,
  isFinalizedGrant,
} from "@interledger/open-payments";

const env = (n, d) => {
  const v = process.env[n] ?? d;
  if (!v) throw new Error(`Falta la variable de entorno ${n}`);
  return v;
};

const client = await createAuthenticatedClient({
  walletAddressUrl: env("OP_CLIENT_WALLET_ADDRESS"),
  privateKey: process.env.OP_PRIVATE_KEY_PATH ?? "private.key",
  keyId: env("OP_KEY_ID"),
});

const receiver = await client.walletAddress.get({ url: env("OP_RECEIVER_WALLET_ADDRESS") });

const grant = await client.grant.request(
  { url: receiver.authServer },
  { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read", "complete"] }] } },
);
if (!isFinalizedGrant(grant)) throw new Error("Grant de incoming-payment no finalizado");

const incomingPayment = await client.incomingPayment.create(
  { url: receiver.resourceServer, accessToken: grant.access_token.value },
  {
    walletAddress: receiver.id,
    incomingAmount: {
      assetCode: receiver.assetCode,
      assetScale: receiver.assetScale,
      value: process.env.OP_AMOUNT ?? "1500",
    },
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    metadata: { description: "Factura 76", externalRef: "INV-76" },
  },
);

console.log("Comparte este identificador con quien va a pagar:");
console.log(`  ${incomingPayment.id}`);
console.log("\nGuarda en tu base de datos:");
console.log(JSON.stringify({
  incomingPaymentId: incomingPayment.id,
  // el token y su 'manage' se guardan cifrados: sirven para consultar y cerrar el cobro
  manage: grant.access_token.manage,
  expiresAt: incomingPayment.expiresAt,
  externalRef: "INV-76",
}, null, 2));

// Cualquiera puede consultar el avance sin token, con el cliente público:
const publicClient = await createUnauthenticatedClient({});
const vistaPublica = await publicClient.incomingPayment.getPublic({ url: incomingPayment.id });
console.log("\nVista pública (sin token):", vistaPublica);
