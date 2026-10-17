---
name: open-payments-webhooks
description: Saber cómo un cliente de Open Payments se entera de que un pago avanzó, y cuál es la diferencia con los webhooks de una ASE. Carga esta skill para implementar polling del estado de un pago, confirmar la recepción desde el lado del receptor, entender los eventos de Rafiki (incoming_payment.completed, outgoing_payment.failed, wallet_address.not_found) y decidir si el proyecto necesita un cliente o una ASE. Palabras clave: webhook, notificación, confirmar pago, polling, Rafiki, eventos, liquidez, estado del pago, conciliación.
---

# Notificaciones: polling en el cliente, webhooks en la ASE

## 1. El hecho incómodo

**Open Payments no define webhooks hacia el cliente.** No hay forma de registrar una URL para
que el proveedor te avise de que un pago se completó. Si eres un cliente —y casi siempre lo
eres— te enteras **consultando** el recurso.

Los webhooks de los que hablan los docs de Interledger son de **Rafiki hacia su propia ASE**:
el proveedor de cuentas los usa para su contabilidad interna, su liquidez y su liquidación. No
llegan a terceros.

| Si eres… | Cómo te enteras |
| --- | --- |
| **Cliente** (e-commerce, app, SaaS) | `GET` del incoming/outgoing payment: polling. |
| **ASE** que corre Rafiki | Webhooks de Rafiki a tu backend. |

Si alguien pide "configurar el webhook de Open Payments para saber si me pagaron", la respuesta
honesta es: no existe; se hace polling, o lo expones tú para tu propio frontend.

## 2. Polling bien hecho (lado emisor)

Requiere `read` en el grant del outgoing payment.

```js
async function confirmar(client, { outgoingPaymentId, accessToken, timeoutMs = 120_000 }) {
  const deadline = Date.now() + timeoutMs;
  let delay = 1000;
  while (Date.now() < deadline) {
    const op = await client.outgoingPayment.get({ url: outgoingPaymentId, accessToken });
    if (op.failed) return { status: "failed", sent: op.sentAmount };
    if (BigInt(op.sentAmount.value) >= BigInt(op.debitAmount.value)) {
      return { status: "completed", sent: op.sentAmount };
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 10_000);
  }
  return { status: "pending" };        // ⚠ NO es "failed"
}
```

Reglas:

- **Backoff exponencial con techo.** Un bucle cada 100 ms contra el proveedor te gana un 429.
- **Timeout ⇒ `pending`.** Marcarlo `failed` y reintentar el pago duplica el cobro.
- No hagas polling dentro del request HTTP del usuario: responde `202`, guarda el estado y que
  el frontend consulte `GET /api/payments/:id`.
- Pon un **límite de vida**: tras N minutos, deja el pago en `pending` para revisión manual y
  deja de consultar desde el request path (que lo recoja el job de reconciliación).

## 3. Confirmar desde el lado receptor (más barato)

Si lo que te importa es "¿me pagaron?", mira el incoming payment:

```js
// con token (grant 'read' del receptor): información completa
const ip = await client.incomingPayment.get({ url: incomingPaymentId, accessToken: ipToken });
const pagado = ip.incomingAmount
  ? BigInt(ip.receivedAmount.value) >= BigInt(ip.incomingAmount.value)
  : BigInt(ip.receivedAmount.value) > 0n;

// sin token: vista pública, suficiente para un paywall
const pub = await publicClient.incomingPayment.getPublic({ url: incomingPaymentId });
```

Ventajas: no necesitas nada del emisor, funciona aunque el pago venga de una billetera
cualquiera, y es el único camino cuando solo generaste un link de cobro.

**Nunca desbloquees contenido o despaches un pedido confiando en un parámetro del cliente.**
La verificación va en el servidor, contra `receivedAmount`.

## 4. Eventos de Rafiki (solo si eres la ASE)

Rafiki hace POST a `WEBHOOK_URL` con `{ id, type, data }`. Eventos principales:

| Evento | Significado | Qué hace la ASE |
| --- | --- | --- |
| `incoming_payment.created` | Se creó un cobro | Registrar |
| `incoming_payment.completed` | Cerrado, fondos recibidos | Acreditar al usuario |
| `incoming_payment.expired` | Expiró sin completarse | Liberar y devolver lo recibido |
| `outgoing_payment.created` | Pago iniciado | Reservar fondos |
| `outgoing_payment.completed` | Enviado | Debitar en firme |
| `outgoing_payment.failed` | Falló | Devolver la reserva |
| `wallet_address.not_found` | Alguien pidió una wallet address inexistente | Crearla al vuelo si aplica |
| `asset.liquidity_low` / `peer.liquidity_low` | Liquidez baja | Reponer |

Si implementas el receptor de estos webhooks:

- **Idempotencia por `event.id`**: Rafiki reintenta. Tabla de eventos procesados con `UNIQUE`.
- **Responde 200 rápido** y procesa en cola; si tardas, Rafiki reintenta y duplicas trabajo.
- **Verifica el origen**: firma compartida o mTLS, y restringe por red.
- Los eventos pueden llegar **desordenados**: `completed` antes de `created`. Modela el estado
  de forma que el orden no importe (upsert, no transiciones estrictas).

## 5. Tu propio webhook hacia frontend y móvil

Lo que sí puedes hacer es que **tu backend** notifique a tus clientes, una vez que el polling
detectó el cambio:

```
backend ──(polling)──> proveedor Open Payments
backend ──(SSE / WebSocket / push)──> frontend / app
```

- **SSE** es lo más simple para "este pago cambió de estado": unidireccional, sobre HTTP,
  reconecta solo.
- **Push nativo** (FCM/APNs) para móvil cuando la app está en background.
- El payload lleva solo `paymentId` y `status`; el cliente reconsulta `GET /api/payments/:id`.
  Nunca mandes montos ni tokens por el canal de notificación como fuente de verdad.

## 6. Reconciliación

Haz un job diario que compare tu base con el proveedor:

```js
// pagos salientes del emisor en el período (requiere 'list' en el grant)
let cursor;
do {
  const page = await client.outgoingPayment.list(
    { url: sender.resourceServer, accessToken, walletAddress: sender.id },
    { first: 100, cursor },
  );
  for (const op of page.result) {
    const local = await db.findByExternalRef(op.metadata?.externalRef);
    if (!local) alertar("Pago en el proveedor sin registro local", op.id);
    else if (local.status !== mapear(op)) await db.corregir(local.id, op);
  }
  cursor = page.pagination?.endCursor;
} while (cursor && page.pagination?.hasNextPage);
```

Por eso vale la pena poner tu `externalRef` en `metadata` desde el principio: es la única llave
que une tu base con los recursos del proveedor.

## 7. ¿Cliente o ASE?

| Señal en el requerimiento | Lo que hace falta |
| --- | --- |
| "pagar", "cobrar", "integrar pagos", "autorizar" | **Cliente** — este SDK. |
| "guardar saldos de usuarios", "emitir access tokens", "cobrar comisión", "liquidar", "ser la billetera" | **ASE** — hay que desplegar **Rafiki** (+ conectividad ILP y cumplimiento KYC/AML). |

Decirlo temprano ahorra semanas: desplegar Rafiki es un proyecto de infraestructura y
regulatorio, no una librería que se instala con npm.
