# Referencia HTTP de Open Payments

Todas las respuestas son `application/json`. Todos los endpoints protegidos exigen
`Authorization: GNAP <access-token>` **y** firma HTTP (`Signature` + `Signature-Input`).

## Wallet Address Server (público, sin token)

| Método | Ruta | Devuelve |
| --- | --- | --- |
| GET | `{walletAddress}` | `id`, `publicName?`, `assetCode`, `assetScale`, `authServer`, `resourceServer` |
| GET | `{walletAddress}/jwks.json` | `{ "keys": [ { kid, x, alg: "EdDSA", kty: "OKP", crv: "Ed25519" } ] }` |

El endpoint de la wallet address **requiere** `Accept: application/json`; sin ese header un
navegador recibe la página HTML del proveedor.

## Resource Server

### Incoming payments — en el servidor del RECEPTOR

| Método | Ruta | Acción del grant |
| --- | --- | --- |
| POST | `/incoming-payments` | `create` |
| GET | `/incoming-payments/{id}` | `read` / `read-all` |
| GET | `/incoming-payments?wallet-address=…` | `list` / `list-all` |
| POST | `/incoming-payments/{id}/complete` | `complete` |
| GET | `/incoming-payments/{id}` *(público, sin token)* | campos reducidos |

Body de creación:

```json
{
  "walletAddress": "https://ilp.interledger-test.dev/bob",
  "incomingAmount": { "value": "1000", "assetCode": "USD", "assetScale": 2 },
  "expiresAt": "2026-12-31T23:59:00Z",
  "metadata": { "description": "Invoice 76", "externalRef": "INV-76" }
}
```

- `incomingAmount` es **opcional** (omitirlo = fixed-send, recibe lo que llegue).
- Su `assetCode`/`assetScale` deben coincidir con los de la wallet address del receptor.
- `expiresAt` es ISO 8601 en el futuro. Sin él, aplica el default del proveedor.
- `metadata` es un objeto libre: útil para tu `orderId`. **Es visible**, no pongas datos sensibles.

Respuesta:

```json
{
  "id": "https://ilp.interledger-test.dev/incoming-payments/<uuid>",
  "walletAddress": "https://ilp.interledger-test.dev/bob",
  "completed": false,
  "incomingAmount": { "value": "1000", "assetCode": "USD", "assetScale": 2 },
  "receivedAmount": { "value": "0", "assetCode": "USD", "assetScale": 2 },
  "expiresAt": "2026-12-31T23:59:00Z",
  "metadata": { "description": "Invoice 76" },
  "createdAt": "2026-10-17T12:00:00Z",
  "updatedAt": "2026-10-17T12:00:00Z",
  "methods": [
    { "type": "ilp", "ilpAddress": "test.rafiki.…", "sharedSecret": "…" }
  ]
}
```

- `id` es una URL: ese es el valor que va en `receiver` de la quote.
- `methods` solo aparece con token (`read`); la versión pública lo omite.
- La versión pública (`GET` sin token) devuelve solo `id`, `receivedAmount`, `incomingAmount?`
  y `authServer`. Sirve para que un emisor que no tiene grant pueda descubrir a dónde pagar.
- `completed: true` o `expiresAt` pasado ⇒ ya no acepta fondos.

### Quotes — en el servidor del EMISOR

| Método | Ruta | Acción |
| --- | --- | --- |
| POST | `/quotes` | `create` |
| GET | `/quotes/{id}` | `read` / `read-all` |

```json
{
  "walletAddress": "https://ilp.interledger-test.dev/alice",
  "receiver": "https://ilp.interledger-test.dev/incoming-payments/<uuid>",
  "method": "ilp"
}
```

- `walletAddress` = la del **emisor**. `receiver` = el `id` del incoming payment.
- `method` es `"ilp"` (en minúscula) para el SDK de Node.
- Opcionalmente **uno solo** de:
  - `receiveAmount` → fija lo que recibe el receptor (equivale a fixed-receive sin
    `incomingAmount` en el incoming payment).
  - `debitAmount` → fija lo que sale de la cuenta del emisor (fixed-send).
  - Si el incoming payment ya trae `incomingAmount`, **no envíes ninguno de los dos**.

Respuesta:

```json
{
  "id": "https://ilp.interledger-test.dev/quotes/<uuid>",
  "walletAddress": "https://ilp.interledger-test.dev/alice",
  "receiver": "https://ilp.interledger-test.dev/incoming-payments/<uuid>",
  "debitAmount":   { "value": "1030", "assetCode": "USD", "assetScale": 2 },
  "receiveAmount": { "value": "1000", "assetCode": "USD", "assetScale": 2 },
  "method": "ilp",
  "expiresAt": "2026-10-17T12:05:00Z",
  "createdAt": "2026-10-17T12:00:00Z"
}
```

`debitAmount - receiveAmount` = comisiones + conversión. La quote **expira** (minutos): si
caduca, hay que crear otra. No la caches.

### Outgoing payments — en el servidor del EMISOR

| Método | Ruta | Acción |
| --- | --- | --- |
| POST | `/outgoing-payments` | `create` |
| GET | `/outgoing-payments/{id}` | `read` / `read-all` |
| GET | `/outgoing-payments?wallet-address=…` | `list` / `list-all` |

```json
{
  "walletAddress": "https://ilp.interledger-test.dev/alice",
  "quoteId": "https://ilp.interledger-test.dev/quotes/<uuid>",
  "metadata": { "externalRef": "ORD-1024" }
}
```

Respuesta:

```json
{
  "id": "https://ilp.interledger-test.dev/outgoing-payments/<uuid>",
  "walletAddress": "https://ilp.interledger-test.dev/alice",
  "quoteId": "https://ilp.interledger-test.dev/quotes/<uuid>",
  "receiver": "https://ilp.interledger-test.dev/incoming-payments/<uuid>",
  "debitAmount":   { "value": "1030", "assetCode": "USD", "assetScale": 2 },
  "receiveAmount": { "value": "1000", "assetCode": "USD", "assetScale": 2 },
  "sentAmount":    { "value": "0",    "assetCode": "USD", "assetScale": 2 },
  "failed": false,
  "createdAt": "2026-10-17T12:01:00Z",
  "updatedAt": "2026-10-17T12:01:00Z"
}
```

El POST devuelve de inmediato con `sentAmount.value = "0"`: el envío es **asíncrono**. El estado
final se determina con `GET`:

- `failed === false && sentAmount.value === debitAmount.value` ⇒ completado.
- `failed === true` ⇒ falló (puede haber enviado parcialmente; revisa `sentAmount`).
- en otro caso ⇒ en progreso, sigue consultando.

No existe un campo `state` en la API pública; `state` es interno de Rafiki.

## Authorization Server (GNAP)

| Método | Ruta | Para qué |
| --- | --- | --- |
| POST | `/` (el `authServer`) | solicitar grant |
| POST | `{continue.uri}` | continuar un grant pendiente |
| DELETE | `{continue.uri}` | cancelar un grant pendiente |
| POST | `{access_token.manage}` | rotar el access token |
| DELETE | `{access_token.manage}` | revocar el access token |

Detalle completo de bodies y del flujo interactivo en la skill `open-payments-grants`.

## Tabla de `access` para grants

| `type` | `actions` válidas | Soporta `limits` |
| --- | --- | --- |
| `incoming-payment` | `create`, `read`, `read-all`, `complete`, `list`, `list-all` | no |
| `quote` | `create`, `read`, `read-all` | no |
| `outgoing-payment` | `create`, `read`, `read-all`, `list`, `list-all` | sí |

`read-all` / `list-all` alcanzan recursos creados por **otros** clientes y suelen requerir
interacción del usuario. Para el flujo normal basta `read` / `list`.
