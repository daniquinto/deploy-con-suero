/**
 * Cifrado de credenciales en reposo (AES-256-GCM).
 *
 * Los access tokens y el continue token de GNAP son credenciales portadoras:
 * quien los tenga puede mover dinero del donante hasta el límite del grant.
 * Por eso no se guardan en claro ni siquiera en el store en memoria —un dump
 * de heap o un log accidental los expondría.
 *
 * No importa `config` a propósito: así los tests pueden ejercitar esto sin un
 * .env completo ni una llave privada.
 */

import crypto from "node:crypto";

/**
 * @param {string|undefined} secret  TOKEN_ENC_SECRET. En producción `config`
 *   ya exige 32+ caracteres; aquí se acepta vacío solo para desarrollo.
 * @returns {{ seal: (plain: string) => string, open: (sealed: string|null) => string|null }}
 */
export function createTokenVault(secret) {
  if (!secret) {
    // Sin secreto el cifrado es teatro, pero el flujo tiene que poder correr
    // en local sin configurar nada. Que se vea en el log.
    console.warn(
      "[tokens] TOKEN_ENC_SECRET no está definida: los tokens se cifran con una " +
        "clave derivada de un valor por defecto. NO usar así en producción.",
    );
  }

  // El secreto es texto arbitrario; la clave AES tiene que ser de 32 bytes.
  const key = crypto
    .createHash("sha256")
    .update(secret ?? "deploy-con-suero-desarrollo")
    .digest();

  return {
    /** texto en claro -> base64(iv | authTag | ciphertext) */
    seal(plain) {
      if (plain === undefined || plain === null) return null;
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(String(plain), "utf8"),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
    },

    /** base64(iv | authTag | ciphertext) -> texto en claro */
    open(sealed) {
      if (!sealed) return null;
      const buffer = Buffer.from(sealed, "base64");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, buffer.subarray(0, 12));
      decipher.setAuthTag(buffer.subarray(12, 28));
      return Buffer.concat([
        decipher.update(buffer.subarray(28)),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}
