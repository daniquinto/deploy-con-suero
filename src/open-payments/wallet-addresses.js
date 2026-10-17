/**
 * Resolución de wallet addresses.
 *
 * Toda wallet address hay que resolverla antes de usarla: su respuesta trae
 * `authServer` (a dónde pedir grants), `resourceServer` (dónde crear los
 * recursos), `assetCode`/`assetScale` (en qué moneda y con cuántos decimales)
 * y `id` (la URL canónica que va en los bodies).
 *
 * Importante: `id` puede no ser idéntico a la URL que pediste. En los bodies
 * de incoming payment, quote y outgoing payment va siempre `id`.
 */

import { config, toWalletAddressUrl } from "./config.js";
import { getPublicClient } from "./client.js";
import { wrapOpenPaymentsError, OpenPaymentsConnectionError } from "./errors.js";

/** url normalizada -> { expiresAt, walletAddress } */
const cache = new Map();

/**
 * Resuelve una wallet address (acepta `$alias`, sin esquema, con barra final).
 *
 * @param {string} input
 * @param {{ cache?: boolean }} [options]
 * @returns {Promise<import("@interledger/open-payments").WalletAddress>}
 */
export async function resolveWalletAddress(input, { cache: useCache = true } = {}) {
  const url = toWalletAddressUrl(input, { allowHttp: config.sdk.useHttp });

  if (useCache && config.walletCacheTtlMs > 0) {
    const hit = cache.get(url);
    if (hit && hit.expiresAt > Date.now()) return hit.walletAddress;
  }

  // Cliente público: resolver una wallet address es una operación pública.
  const client = await getPublicClient();

  let walletAddress;
  try {
    walletAddress = await client.walletAddress.get({ url });
  } catch (error) {
    throw wrapOpenPaymentsError(error, `resolviendo la wallet address ${url}`);
  }

  if (config.walletCacheTtlMs > 0) {
    cache.set(url, {
      walletAddress,
      expiresAt: Date.now() + config.walletCacheTtlMs,
    });
  }

  return walletAddress;
}

/** La wallet address del fondo del proyecto (recibe donaciones, paga comercios). */
export function resolveFundWalletAddress(options) {
  return resolveWalletAddress(config.wallets.fund, options);
}

/**
 * Resuelve donante/receptor de una vez. Devuelve también si comparten activo:
 * si no lo comparten el pago igual funciona —ILP convierte la divisa— pero el
 * monto hay que fijarlo de un solo lado (`receiveAmount` o `debitAmount`).
 */
export async function resolvePair(senderInput, receiverInput, options) {
  const [sender, receiver] = await Promise.all([
    resolveWalletAddress(senderInput, options),
    resolveWalletAddress(receiverInput, options),
  ]);

  return {
    sender,
    receiver,
    sameAsset:
      sender.assetCode === receiver.assetCode &&
      sender.assetScale === receiver.assetScale,
  };
}

/**
 * Comprueba que una wallet address existe y es usable antes de guardarla
 * (p. ej. al dar de alta un comercio local del municipio).
 *
 * No lanza: devuelve el resultado para mostrarlo en el formulario.
 */
export async function validateWalletAddress(input) {
  try {
    const walletAddress = await resolveWalletAddress(input);
    return {
      ok: true,
      walletAddress,
      id: walletAddress.id,
      publicName: walletAddress.publicName,
      asset: {
        assetCode: walletAddress.assetCode,
        assetScale: walletAddress.assetScale,
      },
    };
  } catch (error) {
    const wrapped = wrapOpenPaymentsError(error);
    return { ok: false, code: wrapped.code, message: wrapped.message, hint: wrapped.hint };
  }
}

/**
 * Convierte un monto entero de Open Payments a texto legible.
 * `{ value: "1000", assetScale: 2, assetCode: "USD" }` -> "10.00 USD".
 *
 * Los montos viajan como enteros en string: nunca pasarlos por `Number` para
 * hacer cuentas de dinero.
 */
export function formatAmount(amount) {
  if (!amount) return "";
  const { value, assetScale, assetCode } = amount;
  const digits = String(value).padStart(assetScale + 1, "0");
  const whole = digits.slice(0, digits.length - assetScale);
  const fraction = assetScale > 0 ? `.${digits.slice(digits.length - assetScale)}` : "";
  return `${whole}${fraction} ${assetCode}`;
}

/**
 * Construye un monto de Open Payments en la escala de una wallet address ya
 * resuelta, a partir de un importe "humano" ("12.50").
 */
export function toAmount(humanValue, walletAddress) {
  const text = String(humanValue).trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new OpenPaymentsConnectionError(`Monto inválido: "${humanValue}".`, {
      code: "OP_INVALID_AMOUNT",
    });
  }

  const [whole, fraction = ""] = text.split(".");
  const scale = walletAddress.assetScale;
  if (fraction.length > scale) {
    throw new OpenPaymentsConnectionError(
      `El monto "${humanValue}" tiene más decimales que los ${scale} que admite ` +
        `${walletAddress.assetCode}.`,
      { code: "OP_INVALID_AMOUNT" },
    );
  }

  return {
    value: `${whole}${fraction.padEnd(scale, "0")}`.replace(/^0+(?=\d)/, ""),
    assetCode: walletAddress.assetCode,
    assetScale: scale,
  };
}

/** Vacía la caché de wallet addresses. */
export function clearWalletAddressCache() {
  cache.clear();
}
