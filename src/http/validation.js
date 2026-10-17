import { z } from "zod";

/**
 * "$ilp.interledger-test.dev/ana" o "ilp.../ana" → "https://ilp.interledger-test.dev/ana".
 * Misma regla que `toWalletAddressUrl` de src/open-payments/config.js, pero sin
 * importar ese módulo: cargarlo exige las llaves de Open Payments al arrancar.
 */
export function normalizeWalletAddress(input) {
  const raw = input.trim();
  const candidate = raw.startsWith("$") ? `https://${raw.slice(1)}` : raw.startsWith("http") ? raw : `https://${raw}`;
  const url = new URL(candidate);
  if (url.protocol !== "https:") throw new Error("La wallet address debe empezar por https://.");
  if (url.search || url.hash) throw new Error("La wallet address no admite query string ni fragmento.");
  if (!url.hostname.includes(".") || url.pathname.replace(/\/+$/, "") === "") {
    throw new Error("La wallet address debe tener dominio y nombre, por ejemplo $ilp.interledger-test.dev/nombre.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

/** Wallet address opcional: "" o ausente → null; si viene, se normaliza y valida. */
export const optionalWalletAddress = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    try {
      return normalizeWalletAddress(value);
    } catch (err) {
      ctx.addIssue({ code: "custom", message: err instanceof TypeError ? "La wallet address no es válida." : err.message });
      return z.NEVER;
    }
  });

export const email = z
  .string({ error: "Escribe tu correo." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Escribe un correo válido." }));
