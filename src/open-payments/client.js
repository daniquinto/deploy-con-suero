/**
 * Conexión con la API de Open Payments.
 *
 * `createAuthenticatedClient` es asíncrono (valida la wallet address del
 * cliente y carga la llave) y relativamente caro, así que aquí se crea **una
 * sola vez por proceso** y se reutiliza. No crear un cliente por request.
 *
 *   import { getClient, getPublicClient } from "./src/open-payments/index.js";
 *   const client = await getClient();
 */

import {
  createAuthenticatedClient,
  createUnauthenticatedClient,
} from "@interledger/open-payments";

import { config } from "./config.js";
import { wrapOpenPaymentsError } from "./errors.js";

/** Opciones comunes a los dos clientes. */
function sharedOptions() {
  return {
    validateResponses: config.sdk.validateResponses,
    requestTimeoutMs: config.sdk.requestTimeoutMs,
    logLevel: config.sdk.logLevel,
    useHttp: config.sdk.useHttp,
  };
}

// Se guarda la promesa, no el cliente: dos llamadas concurrentes durante el
// arranque comparten la misma inicialización en vez de crear dos clientes.
let authenticatedClientPromise;
let publicClientPromise;

/**
 * Cliente **autenticado**: firma cada petición con la llave privada del
 * cliente. Necesario para grants, incoming payments, quotes y outgoing
 * payments.
 *
 * @returns {Promise<import("@interledger/open-payments").AuthenticatedClient>}
 */
export function getClient() {
  authenticatedClientPromise ??= createAuthenticatedClient({
    walletAddressUrl: config.client.walletAddressUrl,
    privateKey: config.client.privateKeyPem,
    keyId: config.client.keyId,
    ...sharedOptions(),
  }).catch((error) => {
    // Si falla, descartar la promesa para que el siguiente intento reintente
    // en vez de quedar cacheado el fallo para toda la vida del proceso.
    authenticatedClientPromise = undefined;
    throw wrapOpenPaymentsError(error, "creando el cliente autenticado");
  });

  return authenticatedClientPromise;
}

/**
 * Cliente **no autenticado**, para lo que es público: resolver una wallet
 * address, leer su JWKS o la vista pública de un incoming payment.
 *
 * Úsalo siempre que haya que validar una wallet address escrita por un
 * donante o un comercio: no gasta firmas.
 *
 * @returns {Promise<import("@interledger/open-payments").UnauthenticatedClient>}
 */
export function getPublicClient() {
  publicClientPromise ??= createUnauthenticatedClient(sharedOptions()).catch(
    (error) => {
      publicClientPromise = undefined;
      throw wrapOpenPaymentsError(error, "creando el cliente público");
    },
  );

  return publicClientPromise;
}

/**
 * Inicializa la conexión en el arranque del servidor, para que un .env mal
 * configurado se note en el `docker run` y no en la primera donación.
 */
export async function initOpenPayments() {
  const [client] = await Promise.all([getClient(), getPublicClient()]);
  return client;
}

/** Descarta los clientes memoizados. Para tests y rotación de llaves. */
export function resetClients() {
  authenticatedClientPromise = undefined;
  publicClientPromise = undefined;
}
