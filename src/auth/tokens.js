import jwt from "jsonwebtoken";
import { serverConfig } from "../config/server.js";
import { forbidden, unauthorized } from "../http/errors.js";

/** El token solo lleva id y rol; el resto se consulta en la base de datos. */
export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, serverConfig.jwtSecret, {
    expiresIn: serverConfig.jwtExpiresIn,
  });
}

/** Exige `Authorization: Bearer <token>` y deja `req.auth = { userId, role }`. */
export function requireAuth(req, _res, next) {
  const header = req.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return next(unauthorized());

  try {
    const payload = jwt.verify(token, serverConfig.jwtSecret);
    req.auth = { userId: payload.sub, role: payload.role };
    return next();
  } catch {
    return next(unauthorized("Tu sesión expiró. Vuelve a iniciar sesión."));
  }
}

/** Usar después de requireAuth. */
export function requireRole(role) {
  return (req, _res, next) => (req.auth?.role === role ? next() : next(forbidden()));
}
