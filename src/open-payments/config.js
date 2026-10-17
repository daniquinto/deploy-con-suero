/**
 * Carga y validación de la configuración de Open Payments desde el .env.
 *
 * Única puerta de entrada a `process.env` del módulo: el resto del código
 * importa `config`, nunca lee variables de entorno por su cuenta.
 *
 * Falla rápido al arrancar: un proceso vivo con `OP_KEY_ID` vacío produce
 * 401 incomprensibles mucho más tarde, cuando ya hay dinero en juego.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";

import { ConfigError } from "./errors.js";

dotenv.config({ quiet: true });

/**
 * Normaliza lo que escriba una persona (`$alias`, sin esquema, con barra
 * final) a la URL canónica de una wallet address.
 *
 * Exportada porque el backend también la necesita para validar la wallet
 * address que el donante o el comercio escriben en el formulario.
 */
export function toWalletAddressUrl(input, { allowHttp = false } = {}) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new ConfigError("La wallet address está vacía.");
  }

  const raw = input.trim();
  let candidate;

  if (raw.startsWith("$")) {
    // Payment pointer: $wallet.example/alice -> https://wallet.example/alice
    const rest = raw.slice(1);
    candidate = rest.includes("/")
      ? `https://${rest}`
      : `https://${rest}/.well-known/pay`;
  } else {
    candidate = raw.startsWith("http") ? raw : `https://${raw}`;
  }

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new ConfigError(`"${raw}" no es una wallet address válida.`);
  }

  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    throw new ConfigError(
      `La wallet address debe ser https:// (recibido: ${url.protocol}//). ` +
        "http:// solo se admite con OP_USE_HTTP=true contra un Rafiki local.",
    );
  }
  if (url.search || url.hash) {
    throw new ConfigError("La wallet address no admite query string ni fragmento.");
  }
  // "https://$ilp.example/alice" mezcla las dos notaciones: el "$" acaba
  // dentro del host y la dirección resuelve a ninguna parte. Es un error de
  // tecleo frecuente, tanto en el .env como en el formulario del donante, y
  // sin esta comprobación solo se nota al intentar cobrar.
  if (url.hostname.includes("$")) {
    throw new ConfigError(
      `"${raw}" mezcla las dos notaciones de wallet address. Usa la URL ` +
        `("https://ilp.example/alice") o el payment pointer ("$ilp.example/alice"), ` +
        "pero no el \"$\" después de https://.",
    );
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/.well-known/pay";
  return url.toString().replace(/\/$/, "");
}

function required(key) {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    throw new ConfigError(
      `Falta la variable de entorno ${key}. Complétala en el .env ` +
        "(usa .env.example como plantilla).",
    );
  }
  return value.trim();
}

function optional(key, fallback) {
  const value = process.env[key];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

function asBoolean(key, fallback) {
  const value = optional(key, undefined);
  if (value === undefined) return fallback;
  if (["true", "1", "yes", "si", "sí"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  throw new ConfigError(`${key} debe ser true o false (recibido: "${value}").`);
}

function asInteger(key, fallback, { min = 0 } = {}) {
  const value = optional(key, undefined);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new ConfigError(
      `${key} debe ser un entero >= ${min} (recibido: "${value}").`,
    );
  }
  return parsed;
}

/**
 * Resuelve la llave privada Ed25519 a un PEM en texto, probando las tres
 * formas que admite el .env en orden de prioridad:
 * archivo (OP_PRIVATE_KEY_PATH) > base64 (OP_PRIVATE_KEY_B64) > PEM inline
 * con "\n" literales (OP_PRIVATE_KEY).
 */
function loadPrivateKey() {
  const keyPath = optional("OP_PRIVATE_KEY_PATH", undefined);
  const keyB64 = optional("OP_PRIVATE_KEY_B64", undefined);
  const keyInline = optional("OP_PRIVATE_KEY", undefined);

  let pem;
  let origin;

  if (keyPath) {
    const absolute = path.resolve(process.cwd(), keyPath);
    if (!fs.existsSync(absolute)) {
      throw new ConfigError(
        `No existe la llave privada en ${absolute} (OP_PRIVATE_KEY_PATH=${keyPath}). ` +
          "Descárgala del test wallet (Settings -> Developer Keys) o genérala con " +
          "`openssl genpkey -algorithm ed25519 -out secrets/private.key`.",
      );
    }
    // Lectura síncrona a propósito: ocurre una sola vez, en el arranque.
    pem = fs.readFileSync(absolute, "utf8");
    origin = `archivo ${keyPath}`;
  } else if (keyB64) {
    pem = Buffer.from(keyB64, "base64").toString("utf8");
    origin = "OP_PRIVATE_KEY_B64";
  } else if (keyInline) {
    // En una variable de entorno los saltos de línea del PEM se pierden.
    pem = keyInline.replace(/\\n/g, "\n");
    origin = "OP_PRIVATE_KEY";
  } else {
    throw new ConfigError(
      "Falta la llave privada: define OP_PRIVATE_KEY_PATH, OP_PRIVATE_KEY_B64 " +
        "u OP_PRIVATE_KEY en el .env.",
    );
  }

  pem = pem.trim();

  if (!pem.includes("BEGIN PRIVATE KEY")) {
    throw new ConfigError(
      `La llave de ${origin} no es un PEM PKCS#8 ("-----BEGIN PRIVATE KEY-----"). ` +
        "Si dice BEGIN RSA/EC PRIVATE KEY es la curva equivocada: Open Payments " +
        "solo acepta Ed25519.",
    );
  }

  // Validar aquí evita que el error aparezca recién en la primera firma.
  let keyObject;
  try {
    keyObject = crypto.createPrivateKey(pem);
  } catch (cause) {
    throw new ConfigError(
      `La llave privada de ${origin} no se pudo interpretar: ${cause.message}`,
      { cause },
    );
  }

  if (keyObject.asymmetricKeyType !== "ed25519") {
    throw new ConfigError(
      `La llave de ${origin} es ${keyObject.asymmetricKeyType}, pero Open Payments ` +
        "exige Ed25519 (firma EdDSA).",
    );
  }

  return { pem, keyObject, origin };
}

function buildConfig() {
  const useHttp = asBoolean("OP_USE_HTTP", false);
  const walletUrl = (key, { fallback } = {}) => {
    const value = fallback === undefined ? required(key) : optional(key, fallback);
    // Una variable opcional sin valor se queda sin resolver: pasarla a
    // toWalletAddressUrl haría fallar el arranque por una wallet de prueba
    // que nadie configuró.
    if (value === undefined || value === null || value === "") return null;
    try {
      return toWalletAddressUrl(value, { allowHttp: useHttp });
    } catch (cause) {
      throw new ConfigError(`${key}: ${cause.message}`, { cause });
    }
  };

  const privateKey = loadPrivateKey();

  const publicBaseUrl = optional("PUBLIC_BASE_URL", undefined);
  const interactFinishPath = optional("OP_INTERACT_FINISH_PATH", "/op/callback");

  const config = {
    env: optional("NODE_ENV", "development"),
    port: asInteger("PORT", 3000, { min: 1 }),

    // Credenciales del cliente: las tres cosas que identifican a esta app.
    client: {
      walletAddressUrl: walletUrl("OP_CLIENT_WALLET_ADDRESS"),
      keyId: required("OP_KEY_ID"),
      privateKeyPem: privateKey.pem,
      privateKeyOrigin: privateKey.origin,
    },

    // Wallets del dominio: el fondo que recibe donaciones y paga comercios.
    wallets: {
      fund: walletUrl("OP_FUND_WALLET_ADDRESS"),
      testDonor: walletUrl("OP_TEST_DONOR_WALLET_ADDRESS", { fallback: null }),
      testMerchant: walletUrl("OP_TEST_MERCHANT_WALLET_ADDRESS", { fallback: null }),
    },

    defaultAmount: optional("OP_DEFAULT_AMOUNT", "1000"),

    // Consentimiento interactivo del donante (grant GNAP con interact.finish).
    interact: {
      publicBaseUrl: publicBaseUrl?.replace(/\/$/, ""),
      frontendUrl: optional("FRONTEND_URL", undefined)?.replace(/\/$/, ""),
      finishPath: interactFinishPath.startsWith("/")
        ? interactFinishPath
        : `/${interactFinishPath}`,
      get finishUrl() {
        return publicBaseUrl
          ? `${publicBaseUrl.replace(/\/$/, "")}${this.finishPath}`
          : undefined;
      },
    },

    sdk: {
      validateResponses: asBoolean("OP_VALIDATE_RESPONSES", true),
      requestTimeoutMs: asInteger("OP_REQUEST_TIMEOUT_MS", 10_000, { min: 1 }),
      logLevel: optional("OP_LOG_LEVEL", "info"),
      useHttp,
    },

    walletCacheTtlMs: asInteger("OP_WALLET_CACHE_TTL_SECONDS", 300, { min: 0 }) * 1000,

    tokenEncSecret: optional("TOKEN_ENC_SECRET", undefined),

    // Reglas del producto "donación".
    donations: {
      // Minutos que el cobro queda abierto esperando el consentimiento del
      // donante. Pasado ese plazo el incoming payment expira y hay que
      // empezar de nuevo.
      expiryMinutes: asInteger("DONATION_EXPIRY_MINUTES", 15, { min: 1 }),
      // Límites en unidades humanas del activo ("1", "500"). Se comparan en la
      // escala de la moneda de cada lado: 10 significa 10 USD o 10 EUR.
      minAmount: optional("DONATION_MIN_AMOUNT", undefined) ?? null,
      maxAmount: optional("DONATION_MAX_AMOUNT", undefined) ?? null,
      defaultDescription: optional("DONATION_DESCRIPTION", "Donación"),
      // Montos sugeridos para los botones del formulario (humanos, separados
      // por coma). Solo informativos: el backend valida contra min/max.
      suggestedAmounts: optional("DONATION_SUGGESTED_AMOUNTS", "5,10,25,50")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      // Snapshot del store en disco. Sin esto, un reinicio del contenedor
      // pierde las donaciones a medio camino (ver src/donations/README.md).
      storePath: optional("DONATIONS_STORE_PATH", undefined) ?? null,
      // Cada cuántos segundos corre el job que rescata donaciones a medias.
      resumeIntervalSeconds: asInteger("DONATION_RESUME_INTERVAL_SECONDS", 30, { min: 5 }),
    },

    http: {
      // Orígenes autorizados a llamar a la API desde un navegador. FRONTEND_URL
      // se añade solo. "*" abre la API a cualquier origen: solo para desarrollo.
      corsOrigins: optional("CORS_ALLOWED_ORIGINS", "")
        .split(",")
        .map((value) => value.trim().replace(/\/$/, ""))
        .filter(Boolean),
    },
  };

  if (config.http.corsOrigins.length === 0 && config.interact.frontendUrl) {
    config.http.corsOrigins.push(config.interact.frontendUrl);
  }

  for (const [key, value] of [
    ["DONATION_MIN_AMOUNT", config.donations.minAmount],
    ["DONATION_MAX_AMOUNT", config.donations.maxAmount],
  ]) {
    if (value !== null && !/^\d+(\.\d+)?$/.test(value)) {
      throw new ConfigError(
        `${key} debe ser un monto humano positivo, p. ej. "10" o "0.50" ` +
          `(recibido: "${value}").`,
      );
    }
  }

  if (!/^\d+$/.test(config.defaultAmount)) {
    throw new ConfigError(
      `OP_DEFAULT_AMOUNT debe ser un entero en la escala del activo, en texto ` +
        `(recibido: "${config.defaultAmount}").`,
    );
  }

  if (config.env === "production") {
    // En producción estos dos dejan de ser opcionales: sin PUBLIC_BASE_URL el
    // authorization server no tiene a dónde devolver al donante, y sin
    // TOKEN_ENC_SECRET los access tokens quedarían en claro.
    if (!config.interact.publicBaseUrl?.startsWith("https://")) {
      throw new ConfigError(
        "En producción PUBLIC_BASE_URL es obligatoria y debe ser https:// " +
          "(no localhost): es la URL a la que el authorization server devuelve " +
          "al donante tras autorizar.",
      );
    }
    if (!config.tokenEncSecret || config.tokenEncSecret.length < 32) {
      throw new ConfigError(
        "En producción TOKEN_ENC_SECRET es obligatoria y debe tener 32+ " +
          "caracteres: `openssl rand -base64 32`.",
      );
    }
  }

  return config;
}

/** Configuración validada. Importar esto en lugar de leer `process.env`. */
export const config = Object.freeze(buildConfig());

/**
 * Vista segura para logs y endpoints de diagnóstico: nunca incluye la llave
 * privada ni el secreto de cifrado.
 */
export function describeConfig() {
  return {
    env: config.env,
    clientWalletAddress: config.client.walletAddressUrl,
    keyId: config.client.keyId,
    privateKey: `cargada desde ${config.client.privateKeyOrigin}`,
    fundWalletAddress: config.wallets.fund,
    interactFinishUrl: config.interact.finishUrl ?? "(sin PUBLIC_BASE_URL: modo polling)",
    donations: {
      expiryMinutes: config.donations.expiryMinutes,
      minAmount: config.donations.minAmount,
      maxAmount: config.donations.maxAmount,
      storePath: config.donations.storePath ?? "(solo en memoria)",
    },
    corsOrigins: config.http.corsOrigins,
    sdk: config.sdk,
  };
}
