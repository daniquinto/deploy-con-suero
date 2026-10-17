---
name: open-payments-payment-flow
description: Implementar el flujo completo de pago de Open Payments de punta a punta con el SDK de Node. Carga esta skill para crear un incoming payment, una quote y un outgoing payment entre dos wallet addresses, elegir entre fixed-receive y fixed-send, confirmar el pago con polling, completar o cancelar un incoming payment, y entender qué URL y qué token va en cada llamada. Palabras clave: incomingPayment.create, quote.create, outgoingPayment.create, peer to peer, enviar dinero, cobrar, receiver, quoteId, debitAmount, receiveAmount, sentAmount, flujo de pago.
---

# El flujo de pago completo

## 1. El mapa que hay que memorizar

| Paso | Llamada | `url:` | `accessToken:` del grant de |
| --- | --- | --- | --- |
| 1 | `walletAddress.get` (emisor) | wallet address del emisor | — (público) |
| 1 | `walletAddress.get` (receptor) | wallet address del receptor | — (público) |
| 2 | `grant.request` | **`receptor.authServer`** | — |
| 3 | `incomingPayment.create` | **`receptor.resourceServer`** | paso 2 (`incoming-payment`) |
| 4 | `grant.request` | **`emisor.authServer`** | — |
| 5 | `quote.create` | **`emisor.resourceServer`** | paso 4 (`quote`) |
| 6 | `grant.request` interactivo | **`emisor.authServer`** | — |
| 7 | `grant.continue` | `continue.uri` | continue token del paso 6 |
| 8 | `outgoingPayment.create` | **`emisor.resourceServer`** | paso 7 (`outgoing-payment`) |
| 9 | `outgoingPayment.get` (polling) | `outgoingPayment.id` | paso 7 (necesita `read`) |

Los dos errores que se repiten siempre:

- **La quote va del lado del EMISOR** (paso 5: su resource server, su grant). Lo que apunta al
  receptor es el campo `receiver`, con el `id` del incoming payment.
- **Cada token sirve solo para su grant.** El token del incoming payment no crea la quote.

## 2. Guion mínimo (fixed-receive)

```js
import {
  createAuthenticatedClient,
  isFinalizedGrant,
  OpenPaymentsClientError,
} from "@interledger/open-payments";
import readline from "node:readline/promises";

const client = await createAuthenticatedClient({
  walletAddressUrl: process.env.OP_CLIENT_WALLET_ADDRESS,
  privateKey: process.env.OP_PRIVATE_KEY_PATH ?? "private.key",
  keyId: process.env.OP_KEY_ID,
});

// 1. Descubrimiento
const sender   = await client.walletAddress.get({ url: process.env.OP_SENDER_WALLET_ADDRESS });
const receiver = await client.walletAddress.get({ url: process.env.OP_RECEIVER_WALLET_ADDRESS });

if (sender.assetCode !== receiver.assetCode) {
  console.warn(`Pago con conversión ${sender.assetCode} → ${receiver.assetCode}`);
}

// 2. Grant del incoming payment (AS del receptor, no interactivo)
const ipGrant = await client.grant.request(
  { url: receiver.authServer },
  { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read", "complete"] }] } },
);
if (!isFinalizedGrant(ipGrant)) throw new Error("El grant de incoming-payment no se finalizó");

// 3. Incoming payment (RS del receptor)
const incomingPayment = await client.incomingPayment.create(
  { url: receiver.resourceServer, accessToken: ipGrant.access_token.value },
  {
    walletAddress: receiver.id,                     // ¡el .id, no tu string de entrada!
    incomingAmount: { assetCode: receiver.assetCode, assetScale: receiver.assetScale, value: "1000" },
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    metadata: { description: "Canción de Bob", externalRef: "ORD-1024" },
  },
);

// 4. Grant de la quote (AS del emisor, no interactivo)
const quoteGrant = await client.grant.request(
  { url: sender.authServer },
  { access_token: { access: [{ type: "quote", actions: ["create", "read"] }] } },
);
if (!isFinalizedGrant(quoteGrant)) throw new Error("El grant de quote no se finalizó");

// 5. Quote (RS del EMISOR, apuntando al incoming payment del receptor)
const quote = await client.quote.create(
  { url: sender.resourceServer, accessToken: quoteGrant.access_token.value },
  { walletAddress: sender.id, receiver: incomingPayment.id, method: "ilp" },
);
// quote.debitAmount  = lo que sale de la cuenta del emisor (incluye comisiones y conversión)
// quote.receiveAmount = lo que recibe el receptor
// quote.expiresAt     = a partir de aquí hay que rehacerla

// 6. Grant interactivo del outgoing payment (AS del emisor)
const pending = await client.grant.request(
  { url: sender.authServer },
  {
    access_token: {
      access: [{
        type: "outgoing-payment",
        actions: ["create", "read"],
        identifier: sender.id,
        limits: { debitAmount: quote.debitAmount, receiver: incomingPayment.id },
      }],
    },
    interact: { start: ["redirect"] },
  },
);

console.log("Autoriza el pago aquí:", pending.interact.redirect);
await readline.createInterface({ input: process.stdin, output: process.stdout })
  .question("Pulsa Enter cuando hayas aceptado…");

// 7. Continuar el grant
let finalized;
try {
  finalized = await client.grant.continue({
    url: pending.continue.uri,
    accessToken: pending.continue.access_token.value,
  });
} catch (err) {
  if (err instanceof OpenPaymentsClientError) {
    throw new Error(`No se pudo continuar el grant (${err.status}): ${err.description}`);
  }
  throw err;
}
if (!isFinalizedGrant(finalized)) throw new Error("El usuario no completó la autorización");

// 8. Outgoing payment (RS del emisor)
const outgoingPayment = await client.outgoingPayment.create(
  { url: sender.resourceServer, accessToken: finalized.access_token.value },
  { walletAddress: sender.id, quoteId: quote.id, metadata: { externalRef: "ORD-1024" } },
);

console.log("Pago creado:", outgoingPayment.id, "sentAmount:", outgoingPayment.sentAmount);
```

Pasar `limits.receiver` además de `debitAmount` deja el token inútil para pagar a otro destino.
Es una línea y cierra el riesgo principal de un token filtrado.

## 3. El POST no confirma el pago: hay que confirmar

`outgoingPayment.create` responde con `sentAmount.value === "0"`. El envío por ILP es
**asíncrono**. Confirma consultando el recurso (requiere `read` en el grant):

```js
async function waitForPayment(client, { id, accessToken, timeoutMs = 60_000 }) {
  const deadline = Date.now() + timeoutMs;
  let delay = 1000;
  while (Date.now() < deadline) {
    const op = await client.outgoingPayment.get({ url: id, accessToken });
    if (op.failed) return { status: "failed", payment: op };
    if (BigInt(op.sentAmount.value) >= BigInt(op.debitAmount.value)) {
      return { status: "completed", payment: op };
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 5000);
  }
  return { status: "pending", payment: null };   // sigue en curso: NO lo trates como fallo
}
```

Alternativa desde el lado del receptor (más barata, no necesita el token del emisor):

```js
const ip = await client.incomingPayment.get({ url: incomingPayment.id, accessToken: ipToken });
const llego = BigInt(ip.receivedAmount.value) >= BigInt(ip.incomingAmount.value);
```

O incluso sin token, con `incomingPayment.getPublic({ url })`, que devuelve `receivedAmount`.

**Un timeout no es un fallo.** Marca la orden como `pending` y vuelve a consultar; declararla
fallida y reintentar el pago duplica el cobro.

## 4. Variantes

### Fixed-send (propinas, donaciones, remesas)

El emisor fija lo que sale; el receptor recibe lo que llegue.

```js
// incoming payment SIN incomingAmount
const incomingPayment = await client.incomingPayment.create(
  { url: receiver.resourceServer, accessToken: ipToken },
  { walletAddress: receiver.id, metadata: { description: "Propina" } },
);

// la quote fija el débito
const quote = await client.quote.create(
  { url: sender.resourceServer, accessToken: quoteToken },
  {
    walletAddress: sender.id,
    receiver: incomingPayment.id,
    method: "ilp",
    debitAmount: { assetCode: sender.assetCode, assetScale: sender.assetScale, value: "1000" },
  },
);

// tras cobrar, cierra el incoming payment para que no reciba más
await client.incomingPayment.complete({ url: incomingPayment.id, accessToken: ipToken });
```

### Fixed-receive sin `incomingAmount`

También puedes dejar el incoming payment abierto y fijar `receiveAmount` en la quote. Útil
cuando el mismo incoming payment acumula varios pagos (micropagos).

### Reglas de exclusión

| incoming payment | quote | ¿válido? |
| --- | --- | --- |
| con `incomingAmount` | sin montos | ✅ fixed-receive, el caso normal |
| sin `incomingAmount` | con `debitAmount` | ✅ fixed-send |
| sin `incomingAmount` | con `receiveAmount` | ✅ fixed-receive por quote |
| con `incomingAmount` | con `debitAmount` o `receiveAmount` | ❌ el servidor rechaza |
| sin `incomingAmount` | sin montos | ❌ no hay monto que cotizar |
| con `debitAmount` **y** `receiveAmount` en la quote | | ❌ excluyentes |

### Solo cobrar (el caso más simple)

Si únicamente necesitas generar un link de cobro, te basta el **grant de incoming payment**: no
toca nada del emisor. Devuelves `incomingPayment.id` y quien pague usa su propia app. Es el
patrón de las *payment requests* del test wallet. Ver `examples/receive-only.mjs`.

## 5. Conversión de divisas

Si `sender.assetCode !== receiver.assetCode`, la conversión la hace la red de conectores y queda
reflejada en la quote: `debitAmount` en la moneda del emisor, `receiveAmount` en la del receptor.

- `debitAmount - receiveAmount` **no es comparable** entre monedas distintas. Muestra ambos
  montos por separado; no calcules una "comisión" restando valores de monedas diferentes.
- Los `assetScale` pueden diferir (USD 2, JPY 0, algunos tokens 9). Nunca asumas 2.
- La quote expira **más rápido** cuando hay conversión: ejecútala pronto o rehazla.

## 6. Idempotencia

Los recursos de Open Payments **no son idempotentes**: dos POST crean dos pagos. La protección
tiene que estar en tu lado:

- Una clave de negocio única (`orderId`) con constraint `UNIQUE` en tu base de datos.
- Guarda `incomingPayment.id`, `quote.id` y `outgoingPayment.id` en cuanto los recibes, antes de
  seguir. Si el proceso muere, al reanudar reutilizas lo guardado en lugar de recrear.
- `metadata.externalRef` te permite reconciliar después con `outgoingPayment.list`.
- Antes de reintentar, **lista** los outgoing payments del emisor y busca tu `externalRef`: si ya
  existe, no crees otro.

## Ejemplos ejecutables

| Archivo | Qué hace |
| --- | --- |
| `examples/peer-to-peer.mjs` | Flujo completo fixed-receive con confirmación. Equivale al ejemplo oficial, corregido y con variables de entorno. |
| `examples/fixed-send.mjs` | Propina: el emisor fija el débito y se completa el incoming payment. |
| `examples/receive-only.mjs` | Genera un link de cobro usando solo el grant del receptor. |

```bash
cp .env.example .env   # completa las variables
node .claude/skills/open-payments-payment-flow/examples/peer-to-peer.mjs
```
