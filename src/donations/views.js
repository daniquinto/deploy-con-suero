/**
 * Lo que el frontend y la app móvil ven de una donación.
 *
 * Una fila de donación guarda credenciales (continue token, access tokens) y
 * detalles internos. Esta capa decide qué sale del backend: todo lo que el
 * cliente necesita para mostrar y continuar el flujo, y nada más. Si algo no
 * está aquí, no se filtra.
 */

import { formatAmount } from "../open-payments/index.js";

/** Monto de Open Payments + su versión legible, sin perder el entero original. */
export function describeAmount(amount) {
  if (!amount) return null;
  return {
    value: String(amount.value), // entero en la escala del activo, como string
    assetCode: amount.assetCode,
    assetScale: amount.assetScale,
    formatted: formatAmount(amount), // "10.00 USD", solo para mostrar
  };
}

/** Texto para el donante: qué tiene que hacer ahora. */
const NEXT_STEP = {
  awaiting_consent:
    "Abre interact.redirectUrl en el navegador del donante y autoriza el cargo. " +
    "Después consulta links.status hasta que el estado sea final.",
  authorized: "Autorizado. El backend está creando el pago; consulta links.status.",
  sending: "El pago va en camino por ILP. Consulta links.status hasta 'completed'.",
  completed: "La donación llegó al fondo. No hay nada más que hacer.",
  failed: "El pago falló. Hay que iniciar una donación nueva.",
  expired: "La cotización o el consentimiento caducaron. Inicia una donación nueva.",
  cancelled: "La donación se canceló. Inicia una nueva si el donante quiere reintentar.",
};

/**
 * @param {object} row  fila del store
 * @param {{ basePath?: string }} [options]
 */
export function toPublicDonation(row, { basePath = "/api/donations" } = {}) {
  const view = {
    donationId: row.id,
    externalRef: row.externalRef,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,

    // Quién paga y quién recibe. El destino lo fija el servidor desde la
    // configuración: nunca viene del request.
    donor: {
      walletAddress: row.donorWalletUrl,
      assetCode: row.donorAsset?.assetCode,
      assetScale: row.donorAsset?.assetScale,
    },
    fund: {
      walletAddress: row.fundWalletUrl,
      publicName: row.fundPublicName ?? null,
      assetCode: row.fundAsset?.assetCode,
      assetScale: row.fundAsset?.assetScale,
    },

    // Los dos montos de la quote. Con conversión de divisa no son comparables
    // entre sí: se muestran por separado, nunca restados.
    amounts: {
      mode: row.amountMode, // "send" (el donante fija lo que paga) | "receive"
      debit: describeAmount(row.debitAmount), // sale de la cuenta del donante
      receive: describeAmount(row.receiveAmount), // entra al fondo
      sent: describeAmount(row.sentAmount),
      received: describeAmount(row.receivedAmount),
      sameAsset: row.sameAsset,
    },

    description: row.description ?? null,
    donorName: row.donorName ?? null,

    // Identificadores de los recursos de Open Payments: públicos por diseño y
    // la forma de reconciliar con el proveedor o depurar un pago concreto.
    resources: {
      incomingPaymentId: row.incomingPaymentId ?? null,
      quoteId: row.quoteId ?? null,
      quoteExpiresAt: row.quoteExpiresAt ?? null,
      outgoingPaymentId: row.outgoingPaymentId ?? null,
    },

    failureReason: row.failureReason ?? null,
    nextStep: NEXT_STEP[row.status] ?? null,

    links: {
      status: `${basePath}/${row.id}`,
      cancel: `${basePath}/${row.id}/cancel`,
    },
  };

  // El redirect solo tiene sentido mientras falte el consentimiento. Pasado
  // ese punto es una URL muerta que solo confunde al cliente.
  if (row.status === "awaiting_consent") {
    view.interact = {
      mode: row.interactMode, // "finish": volvemos por el callback | "poll"
      redirectUrl: row.redirectUrl,
      expiresAt: row.consentExpiresAt ?? null,
    };
    if (row.interactMode === "poll") {
      // Sin callback, el cliente nos tiene que avisar de que ya consintió.
      view.links.confirm = `${basePath}/${row.id}/confirm`;
      view.interact.minWaitSeconds = row.continueWait ?? 5;
    }
  }

  return view;
}
