/**
 * Diagnóstico de la conexión.
 *
 * Responde la pregunta "¿está esta instancia en condiciones de mover dinero?"
 * sin mover dinero: valida el .env, que la llave publicada corresponda al
 * `keyId` configurado y que las wallets del proyecto resuelvan.
 *
 * Lo usa `scripts/op-check.mjs` y conviene exponerlo en `GET /health/op`.
 */

import { config, describeConfig } from "./config.js";
import { getClient, getPublicClient } from "./client.js";
import { resolveWalletAddress } from "./wallet-addresses.js";
import { toPublicError } from "./errors.js";

async function step(name, fn) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: Date.now() - startedAt, detail };
  } catch (error) {
    return { name, ok: false, ms: Date.now() - startedAt, error: toPublicError(error) };
  }
}

/**
 * @returns {Promise<{ ok: boolean, config: object, checks: Array<object> }>}
 */
export async function checkConnection() {
  const checks = [];

  checks.push(
    await step("cliente-publico", async () => {
      await getPublicClient();
      return "creado";
    }),
  );

  // El chequeo que más fallos ahorra: si el keyId no está en el JWKS de la
  // wallet address del cliente, toda petición firmada devolverá 401.
  checks.push(
    await step("keyId-en-jwks", async () => {
      const client = await getPublicClient();
      const walletAddress = await resolveWalletAddress(config.client.walletAddressUrl);
      const { keys } = await client.walletAddress.getKeys({ url: walletAddress.id });
      const published = keys.map((key) => key.kid);
      const matches = published.includes(config.client.keyId);

      if (!matches) {
        throw new Error(
          `OP_KEY_ID="${config.client.keyId}" no está publicado en ` +
            `${walletAddress.id}/jwks.json. Publicados: ${published.join(", ") || "ninguno"}. ` +
            "Arregla esto antes de seguir: cualquier petición firmada dará 401.",
        );
      }

      return { keyId: config.client.keyId, publicados: published };
    }),
  );

  checks.push(
    await step("cliente-autenticado", async () => {
      await getClient();
      return "firmado y listo";
    }),
  );

  checks.push(
    await step("wallet-del-fondo", async () => {
      const fund = await resolveWalletAddress(config.wallets.fund);
      return {
        id: fund.id,
        asset: `${fund.assetCode} (escala ${fund.assetScale})`,
        authServer: fund.authServer,
        resourceServer: fund.resourceServer,
      };
    }),
  );

  for (const [label, address] of [
    ["wallet-donante-prueba", config.wallets.testDonor],
    ["wallet-comercio-prueba", config.wallets.testMerchant],
  ]) {
    if (!address) continue;
    checks.push(
      await step(label, async () => {
        const walletAddress = await resolveWalletAddress(address);
        return { id: walletAddress.id, asset: walletAddress.assetCode };
      }),
    );
  }

  return {
    ok: checks.every((check) => check.ok),
    config: describeConfig(),
    checks,
  };
}
