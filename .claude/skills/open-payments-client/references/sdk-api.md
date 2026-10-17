# Superficie de API de `@interledger/open-payments` (Node)

Verifica contra tu versión instalada antes de usar algo poco común:

```bash
npm ls @interledger/open-payments
ls node_modules/@interledger/open-payments/dist
grep -rn "walletAddress\|incomingPayment\|outgoingPayment" node_modules/@interledger/open-payments/dist/client/index.d.ts | head -40
```

## Factories

```ts
createUnauthenticatedClient(args: {
  requestTimeoutMs?: number
  logger?: Logger
  logLevel?: string
  validateResponses?: boolean
  useHttp?: boolean
}): Promise<UnauthenticatedClient>

createAuthenticatedClient(args: {
  walletAddressUrl: string          // wallet address DEL CLIENTE
  privateKey: string | KeyObject    // PEM, base64, ruta a archivo, o KeyObject
  keyId: string
  // + todas las opciones del no autenticado
}): Promise<AuthenticatedClient>
```

Ambas son **async**. Crea el cliente una vez por proceso.

## Patrón de llamada

Casi todos los métodos reciben `(requestArgs, body?)`:

- `requestArgs.url` — a **qué servidor** apuntas (`resourceServer`, `authServer`, o la URL de
  un recurso concreto).
- `requestArgs.accessToken` — el token del grant que autoriza **esa** acción.
- `body` — el payload del recurso.

## Cliente no autenticado

| Método | Args | Devuelve |
| --- | --- | --- |
| `walletAddress.get` | `{ url }` | `WalletAddress` |
| `walletAddress.getKeys` | `{ url }` | `{ keys: JWK[] }` |
| `incomingPayment.getPublic` | `{ url }` | incoming payment con campos reducidos |

El cliente autenticado también expone estos tres.

## Wallet address

```js
const wa = await client.walletAddress.get({ url });
// { id, publicName?, assetCode, assetScale, authServer, resourceServer }
```

Usa `wa.authServer` para los grants, `wa.resourceServer` para los recursos y `wa.id` en los
bodies.

## Grants

```js
// Solicitar
const grant = await client.grant.request(
  { url: walletAddress.authServer },
  {
    access_token: { access: [ { type, actions, limits?, identifier? } ] },
    interact?: { start: ["redirect"], finish?: { method: "redirect", uri, nonce } },
  },
);
// → PendingGrant  { interact: { redirect, finish }, continue: { access_token: { value }, uri, wait } }
// → Grant         { access_token: { value, manage, expires_in, access }, continue? }

// Continuar (tras la interacción)
const finalized = await client.grant.continue(
  { url: grant.continue.uri, accessToken: grant.continue.access_token.value },
  { interact_ref },          // obligatorio si pediste interact.finish
);

// Cancelar un grant pendiente
await client.grant.cancel({ url: grant.continue.uri, accessToken: grant.continue.access_token.value });
```

El SDK rellena por ti el campo `client` del body GNAP con tu `walletAddressUrl`.

## Tokens

```js
const rotated = await client.token.rotate({ url: token.manage, accessToken: token.value });
await client.token.revoke({ url: token.manage, accessToken: token.value });
```

`token.manage` viene dentro de `access_token` del grant finalizado. Guárdalo: sin él no puedes
rotar ni revocar.

## Incoming payment (servidor del receptor)

```js
await client.incomingPayment.create(
  { url: receiver.resourceServer, accessToken },
  { walletAddress: receiver.id, incomingAmount?, expiresAt?, metadata? },
);

await client.incomingPayment.get({ url: incomingPayment.id, accessToken });
await client.incomingPayment.getPublic({ url: incomingPayment.id });   // sin token
await client.incomingPayment.complete({ url: incomingPayment.id, accessToken });

await client.incomingPayment.list(
  { url: receiver.resourceServer, accessToken, walletAddress: receiver.id },
  { first?: number, last?: number, cursor?: string },
);
```

`complete` cierra el pago entrante para que no reciba más fondos: úsalo en fixed-send cuando ya
llegó lo esperado, o al cancelar un carrito.

## Quote (servidor del emisor)

```js
await client.quote.create(
  { url: sender.resourceServer, accessToken },
  {
    walletAddress: sender.id,
    receiver: incomingPayment.id,
    method: "ilp",
    // opcional y excluyente entre sí:
    // receiveAmount: { assetCode, assetScale, value }
    // debitAmount:   { assetCode, assetScale, value }
  },
);

await client.quote.get({ url: quote.id, accessToken });
```

## Outgoing payment (servidor del emisor)

```js
await client.outgoingPayment.create(
  { url: sender.resourceServer, accessToken },
  { walletAddress: sender.id, quoteId: quote.id, metadata? },
);

await client.outgoingPayment.get({ url: outgoingPayment.id, accessToken });

await client.outgoingPayment.list(
  { url: sender.resourceServer, accessToken, walletAddress: sender.id },
  { first?, last?, cursor? },
);
```

## Utilidades exportadas

```js
import {
  createAuthenticatedClient,
  createUnauthenticatedClient,
  isPendingGrant,
  isFinalizedGrant,
  OpenPaymentsClientError,
} from "@interledger/open-payments";
```

- `isPendingGrant(grant)` — hay interacción pendiente; existe `grant.interact` y `grant.continue`.
- `isFinalizedGrant(grant)` — hay `grant.access_token.value` usable.
  Son **type guards**: en TypeScript estrechan el tipo y evitan castear.
- `OpenPaymentsClientError` — error del SDK, con `status`, `description`, `code` y
  `validationErrors`. Ver `open-payments-troubleshooting`.

## Paquetes hermanos

| Paquete | Para qué |
| --- | --- |
| `@interledger/open-payments` | El cliente. Es el que necesitas el 95% del tiempo. |
| `@interledger/http-signature-utils` | Firmar/verificar a mano (RFC 9421), cargar o generar llaves, construir headers. Útil si implementas el cliente en otro runtime o si *verificas* firmas entrantes. |
| `@interledger/openapi` | Validación contra el spec OpenAPI. Es lo que usa `validateResponses`. |

## Otros lenguajes

El protocolo es agnóstico. Existen clientes en **PHP**, **Rust** y **Node/TypeScript**; en
cualquier otro lenguaje se implementa a mano: GNAP + firmas HTTP RFC 9421 con Ed25519 + JSON.
Si te piden Python/Go/Java, el camino es replicar el flujo HTTP de
`references/api-reference.md` de la skill `open-payments-core` y firmar con una librería de
HTTP Message Signatures.
