/**
 * Sistema de donaciones sobre Open Payments.
 *
 * Superficie que consume la capa HTTP: el servicio del flujo, el store, el
 * cifrado de credenciales, la verificación del callback y las vistas públicas.
 *
 *   import { createDonations } from "./src/donations/index.js";
 *   const donations = createDonations();   // usa `config`
 */

import { config } from "../open-payments/index.js";
import { getClient } from "../open-payments/index.js";
import { createDonationStore } from "./store.js";
import { createTokenVault } from "./tokens.js";
import { createDonationService } from "./flow.js";

export { createDonationService, DonationError } from "./flow.js";
export { createDonationStore, RESUMABLE_STATUSES, TERMINAL_STATUSES } from "./store.js";
export { createTokenVault } from "./tokens.js";
export { verifyInteractHash } from "./interact-hash.js";
export { toPublicDonation, describeAmount } from "./views.js";

/**
 * Arma el sistema completo con la configuración del .env: un solo cliente de
 * Open Payments por proceso, un store y un servicio.
 *
 * @returns {Promise<{ service: ReturnType<typeof createDonationService>, store: ReturnType<typeof createDonationStore> }>}
 */
export async function createDonations() {
  const client = await getClient();
  const store = createDonationStore({ filePath: config.donations.storePath });
  const vault = createTokenVault(config.tokenEncSecret);

  const service = createDonationService({
    client,
    store,
    vault,
    settings: {
      fundWalletAddress: config.wallets.fund,
      // Sin PUBLIC_BASE_URL no hay a dónde devolver al donante: el flujo cae
      // a modo polling, que es el que sirve para probar en local.
      finishUrlBase: config.interact.finishUrl,
      incomingPaymentExpiryMs: config.donations.expiryMinutes * 60_000,
      defaultDescription: config.donations.defaultDescription,
      minAmount: config.donations.minAmount,
      maxAmount: config.donations.maxAmount,
      allowHttp: config.sdk.useHttp,
    },
  });

  return { service, store };
}
