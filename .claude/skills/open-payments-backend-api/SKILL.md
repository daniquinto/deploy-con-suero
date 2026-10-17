---
name: open-payments-backend-api
description: Convertir el flujo de Open Payments en un servicio HTTP con estado, para que un frontend web o una app móvil puedan iniciar y autorizar pagos. Carga esta skill para diseñar los endpoints (iniciar pago, callback del consentimiento, consultar estado), persistir el grant pendiente y los access tokens, verificar el hash del redirect, manejar deep links en móvil, idempotencia, reanudación tras un reinicio y despliegue en Docker. Palabras clave: Express, Fastify, API de pagos, callback, redirect uri, interact_ref, deep link, webhook propio, máquina de estados, reconciliación.
---

# Exponer Open Payments como API de tu backend

El guion de consola no sirve en producción: el flujo **se parte en dos** porque el usuario se va
al navegador a consentir. Tu backend tiene que sobrevivir a ese corte.

## 1. La forma del servicio

```
POST /api/payments            → crea incoming payment + quote + grant pendiente
                                devuelve { paymentId, redirectUrl, debitAmount, receiveAmount }
GET  /api/op/callback         → el AS devuelve al usuario con ?hash & ?interact_ref
                                verifica hash, continúa el grant, crea el outgoing payment
GET  /api/payments/:id        → estado para que el frontend haga polling
POST /api/payments/:id/cancel → cierra el incoming payment, revoca tokens, cancela el grant
```

Quién llama a qué:

- `frontend` / `mobile` → `POST /api/payments`, luego abren `redirectUrl`.
- El **authorization server** → `GET /api/op/callback` (en el navegador del usuario).
- `frontend` / `mobile` → `GET /api/payments/:id` hasta que el estado sea final.

Los secretos (llave privada, access tokens, continue token) **nunca** salen del backend. El
frontend solo ve `paymentId`, `redirectUrl` y los montos.

## 2. Máquina de estados

```
created ──► quoted ──► awaiting_consent ──► authorized ──► sending ──► completed
   │           │              │                  │            │
   └───────────┴──────────────┴──────────────────┴────────────┴──► failed / expired / cancelled
```

| Estado | Significado | Qué hay guardado |
| --- | --- | --- |
| `created` | incoming payment creado | `incoming_payment_id`, token del receptor |
| `quoted` | quote creada | `quote_id`, montos, `quote_expires_at` |
| `awaiting_consent` | grant pendiente, usuario en el navegador | `continue_uri`, `continue_token`, `client_nonce`, `as_nonce` |
| `authorized` | grant continuado | `op_access_token`, `op_token_manage` |
| `sending` | outgoing payment creado, ILP en curso | `outgoing_payment_id` |
| `completed` | `sentAmount >= debitAmount` | — |
| `failed` | `failed === true` | motivo |
| `expired` | la quote o el grant caducaron sin consentimiento | — |
| `cancelled` | el usuario o el comercio abortó | — |

Reglas:

- **`sending` nunca se reintenta automáticamente.** Un reintento ciego duplica el cobro. Si
  no sabes si el POST llegó, **lista** los outgoing payments buscando tu `externalRef`.
- `expired` es terminal pero **reintentable como pago nuevo**: nueva quote, nuevo grant.
- Timeout de polling ⇒ el estado sigue siendo `sending`, no `failed`.

## 3. Esquema de persistencia

```sql
CREATE TABLE payments (
  id                   UUID PRIMARY KEY,
  external_ref         TEXT NOT NULL UNIQUE,     -- tu orderId: la llave de idempotencia
  status               TEXT NOT NULL,
  sender_wallet_url    TEXT NOT NULL,
  receiver_wallet_url  TEXT NOT NULL,

  incoming_payment_id  TEXT,
  quote_id             TEXT,
  outgoing_payment_id  TEXT,

  debit_amount_value   TEXT,                     -- entero en string, NUNCA float
  debit_asset_code     TEXT,
  debit_asset_scale    INT,
  receive_amount_value TEXT,
  receive_asset_code   TEXT,
  receive_asset_scale  INT,

  quote_expires_at     TIMESTAMPTZ,

  -- credenciales: cifradas en reposo
  ip_access_token      BYTEA,
  continue_uri         TEXT,
  continue_token       BYTEA,
  client_nonce         TEXT,
  as_nonce             TEXT,
  continue_consumed    BOOLEAN NOT NULL DEFAULT FALSE,
  op_access_token      BYTEA,
  op_token_manage      TEXT,
  op_token_expires_at  TIMESTAMPTZ,

  failure_reason       TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON payments (status, created_at);
CREATE UNIQUE INDEX ON payments (external_ref);
```

Puntos clave:

- Montos como `TEXT` + `assetScale`. Nunca `NUMERIC` ni `FLOAT`: la escala es parte del dato.
- Tokens cifrados con una clave de aplicación (AES-256-GCM con `node:crypto`), no en claro.
- `continue_consumed` se marca **en la misma transacción** en que usas el continue token: es de
  un solo uso y el usuario puede recargar el callback.
- `external_ref` con `UNIQUE` es lo que impide dos pagos por la misma orden.

## 4. El callback es un endpoint de seguridad

```js
app.get("/api/op/callback", async (req, res) => {
  const { hash, interact_ref: interactRef, result } = req.query;
  const payment = await repo.findByNonceState(req.query.state ?? req.cookies.op_state);

  if (!payment) return res.status(404).send("Pago no encontrado");
  if (result === "grant_rejected") return finishAs(payment, "cancelled", res);

  // 1. El hash prueba que este callback viene del AS
  if (!verifyInteractHash({
    clientNonce: payment.client_nonce,
    asNonce: payment.as_nonce,
    interactRef,
    grantEndpoint: payment.auth_server,
    hash,
  })) {
    return res.status(400).send("Hash de interacción inválido");
  }

  // 2. Un solo uso: bloquea la fila y marca consumido ANTES de continuar
  const claimed = await repo.claimContinue(payment.id);   // UPDATE … WHERE NOT continue_consumed
  if (!claimed) return res.redirect(`${FRONTEND_URL}/pago/${payment.id}`);  // recarga: idempotente

  // 3. Continuar el grant y crear el outgoing payment
  …
});
```

Checklist del callback:

- [ ] Verificar `hash` en tiempo constante antes de cualquier otra cosa.
- [ ] Atender `result=grant_rejected` (el usuario declinó) sin tratarlo como error del sistema.
- [ ] El continue token se consume **una vez**; una recarga del navegador no debe cobrar dos veces.
- [ ] La `redirect uri` debe ser `https` y estar fija en configuración, nunca tomada de un
      parámetro del request (sería un open redirect).
- [ ] Terminar con un redirect al frontend; no devuelvas JSON crudo a un navegador.
- [ ] Nunca pongas el continue token ni el access token en la URL de redirect.

## 5. Móvil: deep links

La app abre `redirectUrl` en el navegador del sistema (no en un WebView: el usuario tiene que
poder confiar en la URL de su proveedor). El `interact.finish.uri` sigue apuntando a **tu
backend por https**, y tu backend redirige al deep link de la app:

```js
res.redirect(`miapp://pago/${payment.id}?status=${payment.status}`);
```

Usa App Links / Universal Links verificados y no un esquema custom a secas. Si la app no está
instalada, el fallback es una página web con el estado del pago. El estado de verdad lo
consulta la app en `GET /api/payments/:id`: el deep link es solo una señal de "vuelve a mirar".

## 6. Reanudación tras reinicio

El contenedor se reinicia (deploy, OOM, crash) con pagos a medio camino. Un job periódico los
rescata:

```js
// cada 30 s
for (const p of await repo.findResumable()) {
  switch (p.status) {
    case "awaiting_consent":
      if (p.quote_expires_at < new Date()) await repo.setStatus(p.id, "expired");
      break;                                      // si no, se espera al callback
    case "authorized":
      await createOutgoingPayment(p);             // el POST nunca se hizo
      break;
    case "sending":
      await refreshOutgoingPayment(p);            // GET y actualizar estado
      break;
  }
}
```

`findResumable()` debe tomar un lock por fila (`SELECT … FOR UPDATE SKIP LOCKED`) para que dos
réplicas no procesen el mismo pago.

## 7. Operación

- **Un solo cliente por proceso.** `createAuthenticatedClient` es async y carga la llave: hazlo
  una vez al arrancar y comparte la instancia. Uno por request desperdicia I/O y abre sockets.
- **Falla rápido al arrancar** si falta `OP_KEY_ID`, la llave o la wallet address del cliente.
- **Healthcheck.** El `docker-compose.yml` de este repo ya chequea el puerto; añade
  `GET /healthz` que verifique además que el cliente de Open Payments quedó inicializado.
- **Timeouts.** `requestTimeoutMs` de 5–10 s, y que tu endpoint no quede colgado esperando al
  proveedor: responde `202` y deja que el frontend haga polling.
- **Logs.** Loguea `payment.id`, `incoming_payment_id`, `quote_id`, `outgoing_payment_id`.
  **Nunca** `access_token`, `continue_token` ni la llave privada. Añade un redactor explícito.
- **Métricas que importan:** pagos por estado, tasa de abandono en `awaiting_consent`, quotes
  expiradas, latencia del `GET` de confirmación.

## 8. Ejemplo

`examples/server.mjs` es un servicio Express completo y ejecutable, con almacenamiento en
memoria (sustituible por Postgres), los cuatro endpoints, verificación de hash, consumo único
del continue token y el job de reanudación. Está pensado para encajar con el `Dockerfile` y el
`docker-compose.yml` de este repo (ESM, `PORT=3000`, usuario `node`).

```bash
npm install @interledger/open-payments express
node .claude/skills/open-payments-backend-api/examples/server.mjs
```
