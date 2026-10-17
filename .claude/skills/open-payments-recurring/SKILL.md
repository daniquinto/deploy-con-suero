---
name: open-payments-recurring
description: Pagos repetidos con Open Payments: suscripciones, mensualidades, micropagos y streaming de valor con un solo consentimiento del usuario. Carga esta skill para usar limits.interval en un grant de outgoing-payment, reutilizar y rotar el access token entre cobros, contabilizar el consumo por período, dividir un pago entre varios receptores (split payments), implementar paywalls y Web Monetization, y decidir cuándo pedir un nuevo consentimiento. Palabras clave: interval, suscripción, recurrente, micropagos, streaming, paywall, web monetization, split payment, token rotate, grant de larga vida.
---

# Pagos recurrentes, suscripciones y micropagos

La idea central: **un consentimiento interactivo, N pagos**. El usuario autoriza una vez un
grant de `outgoing-payment` con `limits.interval`, y tu backend crea un outgoing payment por
cobro reutilizando el mismo access token.

Lo que **no** se reutiliza: la quote. Cada cobro necesita su propia quote, porque las tasas y
comisiones cambian y la quote expira en minutos.

## 1. El grant con `interval`

```js
const pending = await client.grant.request(
  { url: sender.authServer },
  {
    access_token: {
      access: [{
        type: "outgoing-payment",
        actions: ["create", "read", "list"],     // "list" ayuda a reconciliar
        identifier: sender.id,
        limits: {
          debitAmount: { assetCode: "USD", assetScale: 2, value: "999" },  // techo POR PERÍODO
          interval: "R12/2026-01-01T00:00:00Z/P1M",                        // 12 meses
          receiver: incomingPaymentId,            // opcional: ver más abajo
        },
      }],
    },
    interact: {
      start: ["redirect"],
      finish: { method: "redirect", uri: `${BASE}/api/op/callback?state=${subId}`, nonce },
    },
  },
);
```

Sintaxis del `interval` (ISO 8601 repetido, `R<n>/<inicio>/<duración>`):

| Valor | Significado |
| --- | --- |
| `R/2026-01-01T00:00:00Z/P1M` | mensual, sin fin |
| `R12/2026-01-01T00:00:00Z/P1M` | 12 meses y termina |
| `R/2026-01-01T00:00:00Z/P1W` | semanal |
| `R/2026-01-01T00:00:00Z/P1D` | diario |
| `R/2026-01-01T00:00:00Z/PT1H` | cada hora (micropagos) |

- El techo **se reinicia** en cada período. `value: "999"` con `P1M` = hasta 9,99 USD por mes,
  no 9,99 en total.
- El usuario ve en la pantalla de consentimiento el monto y la periodicidad: pedir un techo
  desproporcionado eleva el abandono.
- `receiver` fijo es lo más seguro, pero obliga a reutilizar **el mismo incoming payment** en
  todos los cobros. Para una suscripción con factura por mes, omítelo y protege con
  `identifier` + `debitAmount`.

## 2. Qué persistir por suscripción

```sql
CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY,
  user_id             UUID NOT NULL,
  sender_wallet_url   TEXT NOT NULL,
  receiver_wallet_url TEXT NOT NULL,
  status              TEXT NOT NULL,          -- pending | active | paused | cancelled | exhausted
  interval_spec       TEXT NOT NULL,          -- "R12/2026-01-01T00:00:00Z/P1M"
  limit_value         TEXT NOT NULL,          -- techo por período
  limit_asset_code    TEXT NOT NULL,
  limit_asset_scale   INT  NOT NULL,
  op_access_token     BYTEA,                  -- cifrado
  op_token_manage     TEXT,                   -- imprescindible para rotar
  op_token_expires_at TIMESTAMPTZ,
  next_charge_at      TIMESTAMPTZ,
  period_started_at   TIMESTAMPTZ,
  period_spent_value  TEXT NOT NULL DEFAULT '0',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE charges (
  id              UUID PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  period_key      TEXT NOT NULL,              -- "2026-03" : idempotencia por período
  status          TEXT NOT NULL,
  incoming_payment_id TEXT,
  quote_id            TEXT,
  outgoing_payment_id TEXT,
  UNIQUE (subscription_id, period_key)        -- impide cobrar dos veces el mismo mes
);
```

El `UNIQUE (subscription_id, period_key)` es la pieza que impide el doble cobro cuando el cron
se ejecuta dos veces o el proceso se reinicia a medio cobro.

## 3. El ciclo de cobro

```js
async function cobrar(sub) {
  const periodKey = new Date().toISOString().slice(0, 7);         // "2026-03"
  const charge = await db.insertChargeIfAbsent(sub.id, periodKey); // null si ya existe
  if (!charge) return { skipped: "ya cobrado este período" };

  // 1. Token vigente: rotar con margen, no esperar el 401
  const token = await ensureFreshToken(sub);

  // 2. Incoming payment del receptor (grant propio, no interactivo)
  const ipGrant = await client.grant.request(
    { url: receiver.authServer },
    { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read"] }] } },
  );
  const incomingPayment = await client.incomingPayment.create(
    { url: receiver.resourceServer, accessToken: ipGrant.access_token.value },
    {
      walletAddress: receiver.id,
      incomingAmount: { assetCode: sub.limit_asset_code, assetScale: sub.limit_asset_scale, value: sub.amount },
      metadata: { description: `Suscripción ${periodKey}`, externalRef: `${sub.id}:${periodKey}` },
    },
  );

  // 3. Quote NUEVA (las tasas cambian y la anterior expiró)
  const quoteGrant = await client.grant.request(
    { url: sender.authServer },
    { access_token: { access: [{ type: "quote", actions: ["create"] }] } },
  );
  const quote = await client.quote.create(
    { url: sender.resourceServer, accessToken: quoteGrant.access_token.value },
    { walletAddress: sender.id, receiver: incomingPayment.id, method: "ilp" },
  );

  // 4. ¿Cabe en el techo del período?
  const spent = BigInt(sub.period_spent_value);
  const cap = BigInt(sub.limit_value);
  if (spent + BigInt(quote.debitAmount.value) > cap) {
    await db.setStatus(sub.id, "exhausted");
    return { error: "El cobro excede el límite autorizado para este período" };
  }

  // 5. Outgoing payment con el token del grant recurrente (SIN interacción)
  const op = await client.outgoingPayment.create(
    { url: sender.resourceServer, accessToken: token },
    { walletAddress: sender.id, quoteId: quote.id, metadata: { externalRef: `${sub.id}:${periodKey}` } },
  );

  await db.recordSpend(sub.id, quote.debitAmount.value);
  return { outgoingPaymentId: op.id };
}
```

Nota: **el techo lo valida el authorization server**, no tú. Tu contabilidad local
(`period_spent_value`) sirve para fallar antes y dar un error claro, no para autorizar. Si tu
cuenta se desincroniza, el AS devuelve 403 de todas formas.

## 4. Rotación del token de larga vida

```js
async function ensureFreshToken(sub) {
  const margin = 60_000;                                 // rota 1 min antes de expirar
  if (!sub.op_token_expires_at || sub.op_token_expires_at.getTime() - Date.now() > margin) {
    return decrypt(sub.op_access_token);
  }
  const rotated = await client.token.rotate({
    url: sub.op_token_manage,
    accessToken: decrypt(sub.op_access_token),
  });
  await db.saveToken(sub.id, {                            // atómico: value + manage juntos
    token: encrypt(rotated.access_token.value),
    manage: rotated.access_token.manage,
    expiresAt: new Date(Date.now() + rotated.access_token.expires_in * 1000),
  });
  return rotated.access_token.value;
}
```

- **Rotar invalida el token anterior.** Si guardas el nuevo `value` sin el nuevo `manage` (o al
  revés), pierdes el control del token y la suscripción queda inoperable. Guárdalos en una sola
  transacción.
- No rotes en paralelo para la misma suscripción: toma un lock por fila.
- `expires_in` llega en **segundos**; conviértelo a timestamp absoluto al guardar.

## 5. Micropagos y streaming

Crear un outgoing payment por segundo de video es inviable: miles de recursos y comisiones por
cada uno. El patrón correcto es **agregar**:

1. Un grant con `interval` corto (`PT1H`) y techo pequeño.
2. Un incoming payment **abierto** (sin `incomingAmount`) reutilizado durante la sesión.
3. El cliente acumula el consumo en memoria (p. ej. segundos vistos × tarifa).
4. Cada N segundos o al superar un umbral mínimo, crea **un** outgoing payment por el acumulado.
5. Al terminar la sesión, cobra el resto y `incomingPayment.complete`.

```js
const MIN_CHARGE = 10n;     // no cobrar menos de 0,10 USD: la comisión se lo comería
const FLUSH_MS = 30_000;

let acumulado = 0n;
const tick = (segundos) => { acumulado += BigInt(segundos) * TARIFA_POR_SEGUNDO; };

setInterval(async () => {
  if (acumulado < MIN_CHARGE) return;
  const monto = acumulado;
  acumulado = 0n;                        // reserva antes de cobrar
  try {
    await cobrarAcumulado(monto);
  } catch (err) {
    acumulado += monto;                  // devolver al acumulador si falló
  }
}, FLUSH_MS);
```

Define siempre un **monto mínimo**: por debajo de cierto umbral las comisiones superan el cobro.

Para **Web Monetization** el navegador hace esto por ti: tu página solo declara
`<link rel="monetization" href="https://ilp.interledger-test.dev/tu-wallet">` y la extensión o
el navegador gestiona el grant y los pagos. Tu backend solo necesita verificar la recepción
consultando el incoming payment (o recibiendo los webhooks de tu propia ASE).

## 6. Paywall

El paywall no es un tipo de pago distinto: es *fixed-receive* + una verificación.

```js
// 1. crear el incoming payment por el precio del artículo
// 2. devolver incomingPayment.id al frontend
// 3. el usuario paga desde su billetera
// 4. desbloquear SOLO cuando el servidor confirma la recepción:
const ip = await client.incomingPayment.get({ url: id, accessToken: ipToken });
const pagado = BigInt(ip.receivedAmount.value) >= BigInt(ip.incomingAmount.value);
```

Nunca desbloquees por un parámetro de la URL o un evento del cliente: verifica
`receivedAmount` en el servidor.

## 7. Split payments (dividir entre varios receptores)

Open Payments no divide pagos: **un outgoing payment tiene un solo receiver**. Para repartir,
haces N pagos.

```js
// 70% al creador, 30% a la plataforma
for (const { walletAddress, bps } of destinos) {
  const monto = (total * BigInt(bps)) / 10_000n;
  await pagarA(walletAddress, monto.toString());
}
```

- Reparte en **enteros** y asigna el residuo del redondeo a un destino fijo, o perderás
  centavos: `const residuo = total - sumaDeLasPartes`.
- Un grant con `interval` y techo = el total cubre los N pagos de una sesión.
- **No es atómico.** Si el segundo pago falla, el primero ya salió. Decide la política y
  documéntala: registrar la deuda pendiente y reintentar suele ser mejor que intentar revertir.

## 8. Cuándo hay que pedir consentimiento otra vez

- El `interval` llegó a su fin (`R12` agotado).
- Sube el precio por encima del techo autorizado.
- Cambia la wallet address del emisor o del receptor (si fijaste `receiver`).
- El usuario revocó el grant desde su billetera ⇒ el `create` devuelve 401/403.
- El token no se puede rotar (el grant ya no existe).

Trata el 403 por límite como un evento de producto —"renueva tu autorización"—, no como un
error técnico: muestra un botón que relanza el grant interactivo.

## Ejemplo

`examples/subscription.mjs` — alta de suscripción (grant con `interval`), cobro periódico
idempotente por `period_key`, rotación de token y manejo del techo agotado.
