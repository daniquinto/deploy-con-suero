/**
 * Verificación del hash del callback de GNAP.
 *
 * Cuando el donante vuelve del consentimiento, el authorization server lo
 * redirige a nuestro backend con `?hash=…&interact_ref=…`. El `hash` es la
 * única prueba de que esa redirección la originó el AS y no un tercero que
 * adivinó la URL del callback: sin verificarlo, cualquiera podría provocar
 * que continuemos un grant con un `interact_ref` inventado.
 *
 * Se verifica ANTES de tocar el grant o la base de datos.
 */

import crypto from "node:crypto";

/** base64url sin padding, para comparar los dos formatos que circulan. */
function normalize(value) {
  return Buffer.from(
    String(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  );
}

/**
 * @param {object} params
 * @param {string} params.clientNonce   el nonce que generamos al pedir el grant
 * @param {string} params.asNonce       `pending.interact.finish`
 * @param {string} params.interactRef   el `interact_ref` del query string
 * @param {string} params.grantEndpoint el authServer al que hicimos el POST
 * @param {string} params.hash          el `hash` del query string
 * @returns {boolean}
 */
export function verifyInteractHash({
  clientNonce,
  asNonce,
  interactRef,
  grantEndpoint,
  hash,
}) {
  if (!hash || !interactRef || !clientNonce || !asNonce || !grantEndpoint) return false;

  const given = normalize(hash);
  const base = `${clientNonce}\n${asNonce}\n${interactRef}\n${grantEndpoint}`;

  // El hash_base del spec concatena los cuatro valores con "\n". Las
  // implementaciones difieren en si incluyen el salto FINAL: se aceptan las
  // dos. Una vez comprobado cuál usa tu AS, puedes dejar solo esa.
  for (const candidate of [base, `${base}\n`]) {
    const expected = normalize(
      crypto.createHash("sha256").update(candidate).digest("base64url"),
    );
    // timingSafeEqual exige longitudes iguales: compararlas primero no filtra
    // nada útil (la longitud del hash es pública) y evita la excepción.
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) {
      return true;
    }
  }

  return false;
}
