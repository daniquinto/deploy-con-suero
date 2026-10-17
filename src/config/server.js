/**
 * Configuración del servidor HTTP (API propia, base de datos y sesiones).
 *
 * Va aparte de `src/open-payments/config.js` a propósito: la API de usuarios y
 * fundaciones debe poder arrancar aunque todavía falten las credenciales de
 * Open Payments en el .env.
 */
import dotenv from "dotenv";

dotenv.config({ quiet: true });

function required(key) {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Falta la variable de entorno ${key}. Revísala en el .env (plantilla: .env.example).`);
  }
  return value;
}

const env = process.env.NODE_ENV?.trim() || "development";
const jwtSecret = required("JWT_SECRET");

if (env === "production" && jwtSecret.length < 32) {
  throw new Error("En producción JWT_SECRET debe tener 32+ caracteres: `openssl rand -base64 32`.");
}

export const serverConfig = Object.freeze({
  env,
  port: Number(process.env.PORT) || 3000,
  databaseUrl: required("DATABASE_URL"),
  /** "true" si el Postgres exige TLS (la mayoría de los gestionados). */
  databaseSsl: process.env.DATABASE_SSL?.trim() === "true",
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN?.trim() || "7d",
  /** Orígenes permitidos por CORS, separados por coma. */
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  /**
   * Regla de negocio: la fundación nace PENDIENTE y una entidad la activa.
   * Mientras no exista ese flujo, "true" la deja ACTIVA al registrarse.
   */
  autoActivateFoundations: process.env.AUTO_ACTIVATE_FOUNDATIONS?.trim() !== "false",
  /** Corre las migraciones pendientes al arrancar (útil en el deploy). */
  autoMigrate: process.env.AUTO_MIGRATE?.trim() !== "false",
});
