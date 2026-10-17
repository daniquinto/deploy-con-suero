/**
 * Módulo de conexión con la API de Open Payments.
 *
 * Es la única superficie que debe importar el resto del backend: la
 * configuración, los dos clientes del SDK, la resolución de wallet addresses,
 * los montos y los errores traducidos.
 *
 *   import { initOpenPayments, getClient, resolveFundWalletAddress }
 *     from "./src/open-payments/index.js";
 *
 * Qué NO hace: no crea grants, incoming payments, quotes ni outgoing payments.
 * Eso vive en la capa de flujo de pago, que consume este módulo.
 */

export { config, describeConfig, toWalletAddressUrl } from "./config.js";

export {
  getClient,
  getPublicClient,
  initOpenPayments,
  resetClients,
} from "./client.js";

export {
  resolveWalletAddress,
  resolveFundWalletAddress,
  resolvePair,
  validateWalletAddress,
  formatAmount,
  toAmount,
  clearWalletAddressCache,
} from "./wallet-addresses.js";

export { checkConnection } from "./health.js";

export {
  ConfigError,
  OpenPaymentsConnectionError,
  wrapOpenPaymentsError,
  toPublicError,
} from "./errors.js";
