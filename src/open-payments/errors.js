/**
 * Errores del módulo de conexión y traducción de los fallos del SDK.
 *
 * El SDK lanza `OpenPaymentsClientError`, cuyo `status` + `description` son
 * crípticos por sí solos. Aquí se convierten en una causa probable y una
 * acción concreta, para que el log sirva y el frontend reciba algo mostrable.
 */

import { OpenPaymentsClientError } from "@interledger/open-payments";

/** Configuración inválida o incompleta en el .env. Se detecta al arrancar. */
export class ConfigError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ConfigError";
    this.code = "OP_CONFIG_INVALID";
  }
}

/** Fallo al hablar con un servidor de Open Payments (AS o resource server). */
export class OpenPaymentsConnectionError extends Error {
  constructor(message, { cause, status, code, hint, details } = {}) {
    super(message, { cause });
    this.name = "OpenPaymentsConnectionError";
    this.code = code ?? "OP_REQUEST_FAILED";
    this.status = status;
    this.hint = hint;
    this.details = details;
  }
}

const BY_STATUS = {
  400: {
    code: "OP_BAD_REQUEST",
    hint:
      "El body no cumple el spec. Revisa que los recursos usen camelCase " +
      "(walletAddress, incomingAmount), que los montos lleven assetCode + " +
      'assetScale (no "currency") y que method sea "ilp" en minúscula.',
  },
  401: {
    code: "OP_UNAUTHORIZED",
    hint:
      "Firma rechazada o token inválido. Comprueba que OP_KEY_ID coincida con " +
      "una kid publicada en {OP_CLIENT_WALLET_ADDRESS}/jwks.json (`npm run op:check`), " +
      "que la llave privada sea la pareja de esa pública y que el reloj del " +
      "servidor esté sincronizado (una firma con desfase se rechaza).",
  },
  403: {
    code: "OP_FORBIDDEN",
    hint:
      "El token existe pero no cubre esta acción. Revisa el grant: type, " +
      "actions, identifier y limits. Un grant de outgoing-payment con " +
      "debitAmount menor al de la quote da 403.",
  },
  404: {
    code: "OP_NOT_FOUND",
    hint:
      "Recurso o wallet address inexistente. Usa siempre walletAddress.id " +
      "(el servidor canonicaliza la URL) y no la cadena que escribió el usuario.",
  },
  409: {
    code: "OP_CONFLICT",
    hint: "El recurso ya está en ese estado (p. ej. un incoming payment ya completado).",
  },
  422: {
    code: "OP_UNPROCESSABLE",
    hint:
      "El proveedor no puede ejecutar la operación: saldo insuficiente, " +
      "activo no soportado o quote expirada (duran minutos: crea la quote y " +
      "paga en el mismo flujo).",
  },
};

/** Convierte cualquier fallo en un `OpenPaymentsConnectionError` con contexto. */
export function wrapOpenPaymentsError(error, context = "") {
  if (error instanceof OpenPaymentsConnectionError || error instanceof ConfigError) {
    return error;
  }

  const where = context ? ` (${context})` : "";

  if (error instanceof OpenPaymentsClientError) {
    const mapped = BY_STATUS[error.status] ?? {};
    return new OpenPaymentsConnectionError(
      `Open Payments rechazó la petición${where}: ${error.status ?? "sin status"} ` +
        `${error.description ?? error.message}`,
      {
        cause: error,
        status: error.status,
        code: mapped.code,
        hint: mapped.hint,
        details: error.validationErrors,
      },
    );
  }

  if (["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(error?.code)) {
    return new OpenPaymentsConnectionError(
      `No se pudo contactar al servidor de Open Payments${where}: ${error.code}`,
      {
        cause: error,
        code: "OP_UNREACHABLE",
        hint:
          "Revisa la red o la salida del contenedor, y que la wallet address " +
          "apunte al host correcto. Sube OP_REQUEST_TIMEOUT_MS si el proveedor va lento.",
      },
    );
  }

  return new OpenPaymentsConnectionError(
    `Fallo inesperado hablando con Open Payments${where}: ${error?.message ?? error}`,
    { cause: error },
  );
}

/** Forma serializable para una respuesta HTTP o un log estructurado. */
export function toPublicError(error) {
  const wrapped = wrapOpenPaymentsError(error);
  return {
    code: wrapped.code,
    status: wrapped.status,
    message: wrapped.message,
    hint: wrapped.hint,
  };
}
