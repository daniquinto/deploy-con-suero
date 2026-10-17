import { ZodError } from "zod";

/** Error con código HTTP y mensaje apto para mostrar al usuario. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const unauthorized = (message = "Necesitas iniciar sesión.") => new HttpError(401, message);
export const forbidden = (message = "No tienes permiso para esto.") => new HttpError(403, message);
export const notFound = (message = "No encontrado.") => new HttpError(404, message);
export const conflict = (message) => new HttpError(409, message);

/** Middleware final: toda respuesta de error sale como { error, details? }. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({
      error: first?.message ?? "Datos inválidos.",
      details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es JSON válido." });
  }

  console.error(`[api] ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({ error: "Error interno del servidor." });
}
