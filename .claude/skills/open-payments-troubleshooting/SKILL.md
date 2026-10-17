---
name: open-payments-troubleshooting
description: Diagnosticar errores de una integración de Open Payments. Carga esta skill ante cualquier fallo del SDK o de la API: 401 invalid signature, keyId que no coincide, grant no finalizado, isFinalizedGrant, continue 404, quote expirada, 403 por límites, insufficient liquidity, assetScale mal, errores de validación de OpenPaymentsClientError, wallet address no resuelve, problemas de reloj, CORS o secretos en Docker. Palabras clave: error, 401, 403, 404, 409, invalid signature, grant not finalized, quote expired, debug, no funciona.
---

# Diagnóstico de errores

## 1. Leer bien el error del SDK

```js
import { OpenPaymentsClientError } from "@interledger/open-payments";

try {
  await client.incomingPayment.create(/* … */);
} catch (err) {
  if (err instanceof OpenPaymentsClientError) {
    console.error({
      status: err.status,                  // código HTTP
      description: err.description,        // mensaje del servidor
      code: err.code,                      // código de error del proveedor, si lo hay
      validationErrors: err.validationErrors, // si validateResponses está activo
    });
  }
  throw err;
}
```

Sin ese bloque, un `TypeError: Cannot read properties of undefined` oculta un 401. Envuelve
siempre las llamadas al SDK.

## 2. Tabla de errores

### 401 Unauthorized

| Síntoma | Causa | Arreglo |
| --- | --- | --- |
| Todas las peticiones firmadas fallan desde el arranque | `keyId` no coincide con ninguna llave del JWKS | `GET {clientWalletAddress}/jwks.json` y compara `kid` con tu `OP_KEY_ID` |
| 401 "invalid signature" | La llave privada no es el par de la pública publicada | Regenera el par y vuelve a subir la pública |
| 401 intermitente, "created" rechazado | Reloj del contenedor desfasado | Sincroniza NTP en el host; `date -u` dentro y fuera |
| 401 solo en POST | Un proxy/gateway reescribe el body | La firma cubre el body: no toques el payload entre cliente y proveedor |
| 401 al usar un token | Token expirado (`expires_in` ya pasó) | Rota antes de expirar, o pide un grant nuevo |
| 401 en `grant.continue` | El usuario no consintió aún | Espera `continue.wait` y reintenta con backoff |
| 401 al crear la quote | Estás usando el token del grant de incoming payment | Cada token sirve solo para su grant |
| "key not found" | El proveedor cacheó un JWKS viejo | Espera el TTL del cache; en rotaciones, publica la nueva antes de usarla |

### 403 Forbidden

| Síntoma | Causa | Arreglo |
| --- | --- | --- |
| El `outgoingPayment.create` da 403 | El `debitAmount` de la quote excede `limits.debitAmount` del grant | Pide el grant **después** de la quote, con `limits.debitAmount = quote.debitAmount` |
| 403 en el cobro N de una suscripción | Se agotó el techo del período o el `interval` terminó | Relanza el grant interactivo |
| 403 con `limits.receiver` | La quote apunta a otro incoming payment | El `receiver` del grant y el de la quote tienen que coincidir |
| 403 con `identifier` | El `walletAddress` del body no es el del `identifier` | Usa la misma wallet address en los dos |
| 403 pidiendo `read-all` | Ese permiso exige interacción | Usa `read` / `list` para tus propios recursos |

### 404 Not Found

| Síntoma | Causa | Arreglo |
| --- | --- | --- |
| La wallet address no resuelve | Falta `Accept: application/json`, o la URL lleva `$` o barra final | Normaliza: `https://`, sin barra final. El SDK manda el Accept |
| 404 en `grant.continue` | El continue token ya se usó, o el grant expiró | Es de un solo uso: marca `consumed` y, si hace falta, reinicia el flujo |
| 404 en el `GET` de un recurso | Estás apuntando al servidor equivocado | Usa el `id` que devolvió el servidor (ya es una URL completa) |
| 404 en `/jwks.json` | El proveedor no publicó la llave, o la wallet address del cliente está mal | Verifica en la UI de developer keys |

### 400 Bad Request / validación

| Síntoma | Causa | Arreglo |
| --- | --- | --- |
| "walletAddress is required" | Mandaste `wallet_address` (snake_case) | Los recursos usan camelCase; solo GNAP usa snake_case |
| "invalid amount" | Monto con decimales, número en vez de string, o `currency` en vez de `assetCode` | `{ value: "1000", assetCode: "USD", assetScale: 2 }` |
| "asset mismatch" | `assetCode`/`assetScale` distintos a los de la wallet address del receptor | Toma ambos de `walletAddress.get()` |
| "expiresAt must be in the future" | Fecha en el pasado o zona horaria mal | `new Date(Date.now() + 15*60_000).toISOString()` |
| "cannot specify both" | `incomingAmount` + `debitAmount`/`receiveAmount` | Son excluyentes: ver la tabla en `open-payments-payment-flow` |
| "unknown payment method" | `"ILP"` en mayúsculas | `method: "ilp"` |
| `validationErrors` con campos extra | Tu SDK y el proveedor están en versiones distintas | Actualiza el SDK; si urge, `validateResponses: false` |
| "Hash de interacción inválido" en **todos** los callbacks | Tu cálculo del `hash_base` no coincide con el del AS: suele ser el salto de línea **final** | Acepta las dos variantes (con y sin `\n` final) y quédate con la que verifique; ver `open-payments-grants` |
| El callback llega con `result=grant_rejected` | El usuario declinó la autorización | No es un fallo técnico: márcalo `cancelled` y ofrece reintentar |

### 409 / estado del recurso

| Síntoma | Causa | Arreglo |
| --- | --- | --- |
| "incoming payment already completed" | Ya se cerró o expiró | Crea uno nuevo; no se reabren |
| "quote expired" | Pasaron minutos entre la quote y el outgoing payment | Rehaz la quote y, con ella, el grant |
| "insufficient liquidity" / "insufficient balance" | El emisor no tiene saldo, o falta liquidez en la ruta ILP | En el test wallet, recarga; en prod, es la ASE |
| "no route found" | No hay ruta de conectores entre los dos activos | Prueba con el mismo `assetCode` para aislar el problema |

### Errores de JavaScript que en realidad son otra cosa

| Error | Qué pasó realmente |
| --- | --- |
| `Cannot read properties of undefined (reading 'value')` sobre `access_token` | El grant estaba **pendiente**. Falta `isFinalizedGrant` |
| `Cannot read properties of undefined (reading 'redirect')` sobre `interact` | El grant se finalizó sin interacción: pediste un `access` no interactivo |
| `ERR_REQUIRE_ESM` | El SDK es ESM: pon `"type": "module"` o usa `.mjs` |
| `ENOENT: private.key` | Ruta relativa resuelta desde otro cwd. Usa ruta absoluta o `new URL("private.key", import.meta.url)` |
| `error:0909006C PEM routines` | El PEM se rompió al pasar por una variable de entorno (saltos de línea) | Guárdalo en base64 y decodifica |
| `TimeoutError` / `fetch failed` | `requestTimeoutMs` muy bajo, o sin salida a internet desde el contenedor |
| `BigInt` + `Number` en la misma expresión | No se pueden mezclar: convierte explícitamente |

## 3. Flujo de diagnóstico

```
¿Falla TODA petición firmada?
  └─ sí → problema de identidad del cliente:
           1. GET {clientWalletAddress}/jwks.json  → ¿existe tu kid?
           2. ¿OP_KEY_ID coincide exactamente (sin espacios ni saltos)?
           3. ¿private.key es el par de esa pública?
           4. ¿date -u del contenedor está sincronizado?
  └─ no → ¿falla solo UNA llamada?
           1. ¿La URL es del servidor correcto (emisor vs receptor)?
           2. ¿El token viene del grant correcto, con la acción correcta?
           3. ¿El grant está finalizado (isFinalizedGrant)?
           4. ¿Los montos están en la escala correcta, como string entero?
           5. ¿La quote sigue vigente?
```

## 4. Comandos de verificación

```bash
# ¿resuelve la wallet address?
curl -sH "Accept: application/json" https://ilp.interledger-test.dev/alice | jq

# ¿está publicada tu llave?
curl -s https://ilp.interledger-test.dev/mi-cliente/jwks.json | jq '.keys[].kid'

# ¿tu llave privada es Ed25519?
openssl pkey -in private.key -text -noout | head -3

# ¿coincide tu pública con la publicada?
openssl pkey -in private.key -pubout -outform DER | tail -c 32 | basenc --base64url | tr -d '='

# ¿el reloj del contenedor está bien?
docker compose exec backend date -u && date -u

# ¿la versión del SDK?
npm ls @interledger/open-payments
```

## 5. Logging para depurar

```js
const client = await createAuthenticatedClient({
  walletAddressUrl, privateKey, keyId,
  logLevel: "debug",            // muestra requests, headers de firma y respuestas
  validateResponses: true,      // atrapa incompatibilidades con el spec
});
```

**Antes de pegar logs en un issue o en un chat**, redacta `Signature`, `Authorization`,
`access_token.value`, `continue.access_token.value` y `sharedSecret`. Un access token pegado en
un ticket es una credencial filtrada.

En producción, un redactor explícito:

```js
const REDACT = /(access_token|accessToken|authorization|signature|sharedSecret|privateKey)/i;
const safe = (o) => JSON.parse(JSON.stringify(o, (k, v) => (REDACT.test(k) ? "[REDACTED]" : v)));
```

## 6. Problemas específicos de este repo (Docker)

| Síntoma | Causa | Arreglo |
| --- | --- | --- |
| `ENOENT: private.key` en el contenedor pero funciona en local | La llave está en `.dockerignore` (correcto) y no se montó | Monta `./secrets/private.key:/run/secrets/op_private_key:ro` y apunta `OP_PRIVATE_KEY_PATH` ahí |
| `EACCES` al leer la llave | El contenedor corre como `node` (uid 1000) y el archivo es root-only | `chown 1000:1000 secrets/private.key` o `chmod 0444` |
| 401 solo en la VPS | Reloj del host desfasado | `timedatectl` / NTP en la VPS |
| Healthcheck en rojo tras el deploy | El proceso murió al arrancar por falta de una variable | Revisa `docker compose logs backend`: la validación de config debe fallar con un mensaje claro |
| El callback del AS nunca llega | `PUBLIC_BASE_URL` apunta a localhost o a http | Tiene que ser una URL `https` pública y alcanzable |

## 7. Tres cosas que no son errores

- **`sentAmount: "0"` justo después de crear el outgoing payment.** El envío es asíncrono.
- **`receivedAmount: "0"` en un incoming payment recién creado.** Todavía no ha pagado nadie.
- **Un timeout de polling.** El pago sigue en curso; el estado es `pending`, no `failed`.
  Reintentar el pago aquí es la forma más fácil de cobrar dos veces.
