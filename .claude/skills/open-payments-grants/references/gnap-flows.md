# Flujos GNAP: secuencias y bodies crudos

## A. Grant no interactivo (incoming payment / quote)

```
cliente                                  AS del dueño del recurso
   │  POST {authServer}                              │
   │  (firmado: Signature + Signature-Input)         │
   │  { client, access_token: { access: [...] } }     │
   │ ───────────────────────────────────────────────> │
   │                                                  │
   │  200 { access_token: { value, manage, expires_in, access } }
   │ <─────────────────────────────────────────────── │
```

Request real:

```http
POST / HTTP/1.1
Host: auth.interledger-test.dev
Content-Type: application/json
Signature-Input: sig1=("@method" "@target-uri" "content-digest" "content-length" "content-type");keyid="<keyId>";created=1760000000;alg="ed25519"
Signature: sig1=:<base64>:
Content-Digest: sha-512=:<base64>:

{
  "client": "https://ilp.interledger-test.dev/mi-cliente",
  "access_token": {
    "access": [
      { "type": "incoming-payment", "actions": ["create", "read", "complete"] }
    ]
  }
}
```

`client` lo rellena el SDK con tu `walletAddressUrl`.

Respuesta:

```json
{
  "access_token": {
    "value": "6F1EC0AC9E4FA5F37B4F",
    "manage": "https://auth.interledger-test.dev/token/<id>",
    "expires_in": 600,
    "access": [{ "type": "incoming-payment", "actions": ["create","read","complete"] }]
  },
  "continue": {
    "access_token": { "value": "<continue token>" },
    "uri": "https://auth.interledger-test.dev/continue/<id>"
  }
}
```

## B. Grant interactivo con `finish` (web / móvil)

```
cliente          AS del emisor        navegador del usuario        IdP
  │  POST / (access + interact.finish)     │                       │
  │ ─────────────────────>                 │                       │
  │  200 PendingGrant                      │                       │
  │  { interact:{redirect,finish}, continue:{uri,access_token,wait} }
  │ <─────────────────────                 │                       │
  │                                        │                       │
  │  302 → interact.redirect ─────────────>│ ────────────────────> │
  │                                        │   login + consiente   │
  │                                        │ <──────────────────── │
  │  GET /op/callback?hash=…&interact_ref=…│                       │
  │ <──────────────────────────────────────│                       │
  │  (verificar hash)                      │                       │
  │  POST {continue.uri} { interact_ref }  │                       │
  │ ─────────────────────>                 │                       │
  │  200 Grant { access_token }            │                       │
  │ <─────────────────────                 │                       │
```

Body de la solicitud:

```json
{
  "client": "https://ilp.interledger-test.dev/mi-cliente",
  "access_token": {
    "access": [{
      "type": "outgoing-payment",
      "actions": ["create", "read"],
      "identifier": "https://ilp.interledger-test.dev/alice",
      "limits": {
        "debitAmount": { "value": "1030", "assetCode": "USD", "assetScale": 2 },
        "receiver": "https://ilp.interledger-test.dev/incoming-payments/<uuid>"
      }
    }]
  },
  "interact": {
    "start": ["redirect"],
    "finish": {
      "method": "redirect",
      "uri": "https://api.midominio.com/op/callback",
      "nonce": "7f9c2d14-…"
    }
  }
}
```

Respuesta pendiente:

```json
{
  "interact": {
    "redirect": "https://auth.interledger-test.dev/interact/<id>/<nonce>",
    "finish": "<nonce del AS>"
  },
  "continue": {
    "access_token": { "value": "<continue token>" },
    "uri": "https://auth.interledger-test.dev/continue/<id>",
    "wait": 5
  }
}
```

Continuación:

```http
POST /continue/<id> HTTP/1.1
Authorization: GNAP <continue token>
Content-Type: application/json

{ "interact_ref": "<el del callback>" }
```

### Cálculo del `hash` del callback

```
hash_base = client_nonce + "\n" + as_nonce + "\n" + interact_ref + "\n" + grant_endpoint
hash      = base64url( SHA-256( hash_base ) )
```

⚠ Las implementaciones de GNAP difieren en si el `hash_base` lleva un salto de línea **final**.
Acepta las dos variantes al principio, comprueba con un callback real cuál usa tu authorization
server, y deja solo esa. Si rechazas callbacks legítimos por este detalle, el síntoma es
"Hash de interacción inválido" en todos los pagos.

- `client_nonce` — el `interact.finish.nonce` que enviaste.
- `as_nonce` — `interact.finish` de la respuesta pendiente.
- `grant_endpoint` — la URL exacta del AS a la que hiciste el POST inicial.
- Compara con `timingSafeEqual`. Si no coincide: 400 y **no** continúes el grant.

## C. Grant interactivo sin `finish` (CLI / script)

```
cliente                         AS                     usuario
  │  POST / (interact.start=["redirect"])  │              │
  │ ─────────────────────>                 │              │
  │  200 PendingGrant                      │              │
  │ <─────────────────────                 │              │
  │  imprime interact.redirect ────────────────────────> abre en el navegador, consiente
  │  (espera: Enter, o polling cada `wait`)│              │
  │  POST {continue.uri}  (sin body)       │              │
  │ ─────────────────────>                 │              │
  │  200 Grant | 401 si aún no consintió   │              │
  │ <─────────────────────                 │              │
```

## D. Grant recurrente (un consentimiento, N pagos)

```json
{
  "access_token": {
    "access": [{
      "type": "outgoing-payment",
      "actions": ["create", "read", "list"],
      "identifier": "https://ilp.interledger-test.dev/alice",
      "limits": {
        "debitAmount": { "value": "999", "assetCode": "USD", "assetScale": 2 },
        "interval": "R12/2026-01-01T00:00:00Z/P1M"
      }
    }]
  },
  "interact": { "start": ["redirect"], "finish": { "method": "redirect", "uri": "…", "nonce": "…" } }
}
```

`interval` es ISO 8601 repetido: `R<n>/<inicio>/<duración>`.

| Patrón | Significado |
| --- | --- |
| `R/2026-01-01T00:00:00Z/P1M` | mensual, indefinido |
| `R12/2026-01-01T00:00:00Z/P1M` | 12 meses |
| `R/2026-01-01T00:00:00Z/P1W` | semanal |
| `R/2026-01-01T00:00:00Z/P1D` | diario |
| `R/2026-01-01T00:00:00Z/PT1H` | cada hora (micropagos) |

El techo (`debitAmount`) se **reinicia** en cada período. Hay que crear un outgoing payment por
cobro, siempre con su propia quote. Ver `open-payments-recurring`.

## E. Rotación y revocación

```http
POST {access_token.manage}        Authorization: GNAP <token actual>   → token nuevo
DELETE {access_token.manage}      Authorization: GNAP <token actual>   → 204
DELETE {continue.uri}             Authorization: GNAP <continue token> → 204 (cancela el grant)
```

## Matriz de decisión

| Situación | Grants | Interacción | Nota |
| --- | --- | --- | --- |
| Pago único peer-to-peer | 3 separados | `finish` (web) o polling (CLI) | El flujo canónico. |
| Cobro en e-commerce | 3 separados | `finish` con `uri` de tu backend | El límite = `quote.debitAmount` exacto. |
| Suscripción mensual | incoming+quote por cobro; **1** outgoing con `interval` | `finish`, una sola vez | Guarda token, `manage` y `expires_in`. |
| Micropagos / streaming | 1 incoming reutilizable; quote + outgoing por tick | `finish`, una sola vez, `interval` corto | Agrupa para no crear miles de recursos. |
| Solo recibir (cobrar) | 1 grant `incoming-payment` | ninguna | No necesitas nada del emisor. |
| Solo consultar lo público | **ninguno** | ninguna | `createUnauthenticatedClient`. |
| Agregador que lee pagos de terceros | `read-all` / `list-all` | sí, incluso para incoming | Justifícalo: es un permiso amplio. |
