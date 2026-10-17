/**
 * Verificacion de humo: lo primero que hay que ejecutar antes de depurar nada.
 * Comprueba, en orden, lo que rompe el 90% de las integraciones:
 *
 *   1. variables de entorno presentes
 *   2. la wallet address del cliente resuelve
 *   3. el keyId configurado esta publicado en el JWKS
 *   4. la llave privada local es Ed25519 y es el par de la publicada
 *   5. las wallet addresses de emisor y receptor resuelven
 *   6. una peticion FIRMADA pasa (grant de prueba, luego revocado)
 *
 * Uso: node smoke.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import {
  createAuthenticatedClient,
  createUnauthenticatedClient,
  isFinalizedGrant,
  OpenPaymentsClientError,
} from "@interledger/open-payments";

const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.error(`  ✗ ${m}`); process.exitCode = 1; };
const step = (m) => console.log(`\n${m}`);

// 1 ─ Variables de entorno
step("1. Variables de entorno");
const required = [
  "OP_CLIENT_WALLET_ADDRESS",
  "OP_KEY_ID",
  "OP_SENDER_WALLET_ADDRESS",
  "OP_RECEIVER_WALLET_ADDRESS",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  bad(`faltan: ${missing.join(", ")}`);
  console.error("\nCompleta el .env antes de seguir (ver .claude/.env.example).");
  process.exit(1);
}
for (const k of required) {
  const v = process.env[k];
  if (v.startsWith("$")) bad(`${k} empieza con "$": usa la forma https://`);
  else if (!v.startsWith("https://")) bad(`${k} no es una URL https://`);
  else if (v.endsWith("/")) bad(`${k} termina en "/": quita la barra final`);
  else ok(`${k} = ${v}`);
}
const keyPath = process.env.OP_PRIVATE_KEY_PATH ?? "private.key";
if (!fs.existsSync(keyPath)) {
  bad(`no existe la llave privada en ${keyPath}`);
  process.exit(1);
}
ok(`llave privada encontrada en ${keyPath}`);

const pub = await createUnauthenticatedClient({ requestTimeoutMs: 10_000 });

// 2 ─ La wallet address del cliente resuelve
step("2. Wallet address del cliente");
let clientWa;
try {
  clientWa = await pub.walletAddress.get({ url: process.env.OP_CLIENT_WALLET_ADDRESS });
  ok(`resuelve: ${clientWa.id} (${clientWa.assetCode}, escala ${clientWa.assetScale})`);
  if (clientWa.id !== process.env.OP_CLIENT_WALLET_ADDRESS) {
    console.log(`  ⓘ el servidor canonicaliza a ${clientWa.id}: usa SIEMPRE el .id en los bodies`);
  }
} catch (err) {
  bad(`no resuelve: ${err.description ?? err.message}`);
  process.exit(1);
}

// 3 ─ El keyId esta publicado
step("3. JWKS y keyId");
let publishedJwk;
try {
  const { keys } = await pub.walletAddress.getKeys({ url: clientWa.id });
  ok(`el JWKS publica ${keys.length} llave(s): ${keys.map((k) => k.kid).join(", ")}`);
  publishedJwk = keys.find((k) => k.kid === process.env.OP_KEY_ID);
  if (publishedJwk) ok(`OP_KEY_ID coincide con una llave publicada`);
  else bad(`OP_KEY_ID (${process.env.OP_KEY_ID}) NO esta en el JWKS: toda firma dara 401`);
} catch (err) {
  bad(`no se pudo leer el JWKS: ${err.description ?? err.message}`);
}

// 4 ─ La llave privada local corresponde a la publicada
step("4. Llave privada local");
try {
  const priv = crypto.createPrivateKey(fs.readFileSync(keyPath, "utf8"));
  const jwk = crypto.createPublicKey(priv).export({ format: "jwk" });
  if (jwk.crv !== "Ed25519") bad(`la llave es ${jwk.crv}, se requiere Ed25519`);
  else ok("la llave privada es Ed25519");
  if (publishedJwk) {
    if (publishedJwk.x === jwk.x) ok("la publica derivada coincide con la publicada en el JWKS");
    else bad("la llave privada NO es el par de la publicada: regenera o vuelve a subirla");
  }
} catch (err) {
  bad(`no se pudo leer la llave privada: ${err.message}`);
  console.error("  Si la cargas por variable de entorno, los saltos de linea del PEM se rompen:");
  console.error("  guarda el PEM en base64 y decodificalo al arrancar.");
}

// 5 ─ Emisor y receptor
step("5. Wallet addresses de emisor y receptor");
let sender, receiver;
for (const [label, key] of [["emisor", "OP_SENDER_WALLET_ADDRESS"], ["receptor", "OP_RECEIVER_WALLET_ADDRESS"]]) {
  try {
    const wa = await pub.walletAddress.get({ url: process.env[key] });
    ok(`${label}: ${wa.id} (${wa.assetCode}, escala ${wa.assetScale})`);
    ok(`  authServer=${wa.authServer}  resourceServer=${wa.resourceServer}`);
    if (label === "emisor") sender = wa; else receiver = wa;
  } catch (err) {
    bad(`${label} no resuelve: ${err.description ?? err.message}`);
  }
}
if (sender && receiver && sender.assetCode !== receiver.assetCode) {
  console.log(`  ⓘ habra conversion ${sender.assetCode} → ${receiver.assetCode}: la quote expira mas rapido`);
}

// 6 ─ Una peticion FIRMADA de verdad
step("6. Peticion firmada (grant de prueba)");
if (process.exitCode === 1) {
  console.log("  ⊘ omitido: arregla lo anterior primero");
} else {
  try {
    const client = await createAuthenticatedClient({
      walletAddressUrl: clientWa.id,
      privateKey: keyPath,
      keyId: process.env.OP_KEY_ID,
      requestTimeoutMs: 10_000,
    });
    const grant = await client.grant.request(
      { url: receiver.authServer },
      { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read"] }] } },
    );
    if (!isFinalizedGrant(grant)) {
      bad("el grant de incoming-payment no se finalizo (deberia ser inmediato)");
    } else {
      ok(`firma aceptada: grant obtenido (expires_in=${grant.access_token.expires_in}s)`);
      // Higiene: no dejar tokens vivos de una prueba
      try {
        await client.token.revoke({
          url: grant.access_token.manage,
          accessToken: grant.access_token.value,
        });
        ok("token de prueba revocado");
      } catch { console.log("  ⓘ no se pudo revocar el token de prueba (expira solo)"); }
    }
  } catch (err) {
    if (err instanceof OpenPaymentsClientError) {
      bad(`HTTP ${err.status}: ${err.description}`);
      if (err.status === 401) {
        console.error("  401 con la firma: revisa keyId, el par de llaves y el reloj del sistema.");
        console.error(`  reloj local UTC: ${new Date().toISOString()}`);
      }
    } else bad(err.message);
  }
}

console.log(
  process.exitCode === 1
    ? "\nHay problemas. Revisa los ✗ de arriba (y la skill open-payments-troubleshooting)."
    : "\nTodo en orden: la integracion puede firmar y operar.",
);
