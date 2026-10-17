# `src/donations/` — sistema de donaciones

Convierte el flujo de Open Payments en un producto: una persona conecta su wallet, autoriza un
cargo y el dinero entra **directo a la cuenta principal del fondo**. No hay cuentas intermedias
ni custodia: el `incoming payment` se crea sobre la wallet del fondo y es ahí donde aterriza el
pago.

El destino sale de `OP_FUND_WALLET_ADDRESS` y **nunca** del request. Aunque alguien manipule la
petición, el dinero solo puede terminar en el fondo.

## Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `flow.js` | La orquestación: grants, incoming payment, quote, outgoing payment, confirmación, cancelación y reanudación. Recibe el cliente por inyección, así que se puede probar sin red. |
| `store.js` | Las donaciones en curso. En memoria, con snapshot opcional a JSON. Mismo contrato que tendría un repositorio sobre Postgres. |
| `tokens.js` | Cifrado AES-256-GCM de los access tokens y el continue token en reposo. |
| `interact-hash.js` | Verificación del `hash` del callback de GNAP: la prueba de que la redirección viene del authorization server. |
| `views.js` | Qué sale del backend hacia el frontend. Lo que no esté aquí, no se filtra. |
| `index.js` | Superficie pública y el armado con la configuración del `.env`. |

## El flujo, partido en dos

El consentimiento ocurre en el navegador del donante, fuera de nuestro proceso. Por eso el
flujo tiene dos mitades y el estado se persiste en medio.

```
mitad 1 — POST /api/donations
  1. resolver wallet del donante + wallet del fondo
  2. grant de incoming-payment   AS del FONDO      (no interactivo)
  3. incoming payment            RS del FONDO      <- aquí entra el dinero
  4. grant de quote              AS del DONANTE    (no interactivo)
  5. quote                       RS del DONANTE
  6. grant de outgoing-payment   AS del DONANTE    (INTERACTIVO)
     -> devuelve interact.redirectUrl y guarda el continue token

        ~~~ el donante autoriza en su proveedor ~~~

mitad 2 — GET /op/callback/:id   (o POST /api/donations/:id/confirm)
  7. grant.continue              -> access token del pago
  8. outgoing payment            RS del DONANTE
  9. polling hasta que sentAmount >= debitAmount
```

Las dos confusiones que producen el 90% de los 401/403: **la quote vive del lado del que paga**
(su resource server, su grant) y **cada token sirve solo para su propio grant**.

## Máquina de estados

```
awaiting_consent ──► authorized ──► sending ──► completed
       │                  │             │
       └──────────────────┴─────────────┴──► failed / expired / cancelled
```

| Estado | Significado |
| --- | --- |
| `awaiting_consent` | Cobro y cotización listos; el donante está autorizando. |
| `authorized` | Grant continuado: tenemos el token del pago, el pago aún no se creó. |
| `sending` | Outgoing payment creado; el envío por ILP va en curso. |
| `completed` | `sentAmount >= debitAmount`. Cobro cerrado y tokens revocados. |
| `failed` | El proveedor marcó el pago como fallido, o lo rechazó con un 4xx. |
| `expired` | La cotización o el token caducaron sin completar. Reintentable como donación nueva. |
| `cancelled` | El donante declinó, o se canceló desde la API. |

Reglas que evitan cobrar dos veces:

- **`sending` no se reintenta nunca.** Solo se consulta. Un reintento ciego duplica el cargo.
- **Un timeout de consulta deja el estado en `sending`**, no en `failed`: no saber todavía no es
  fallar.
- **`externalRef` es único.** Dos peticiones con el mismo ref (o la misma cabecera
  `Idempotency-Key`) devuelven la misma donación.
- **El continue token se consume una sola vez.** Recargar el callback en el navegador no crea un
  segundo pago.

## Los dos modos de monto

| `amountMode` | Quién fija el monto | Incoming payment | Quote |
| --- | --- | --- | --- |
| `send` (por defecto) | El donante: "doy 10". Al fondo llega eso menos comisiones y conversión. | sin `incomingAmount` | con `debitAmount` |
| `receive` | El fondo recibe exactamente 10; el donante paga lo que haga falta. | con `incomingAmount` | sin montos |

Para donaciones el natural es `send`: es lo que la persona espera que se le cobre. Los dos
montos se guardan siempre por separado, porque con comisiones o conversión de divisa nunca son
el mismo número — y si las monedas difieren, **no son comparables**: no restes uno del otro
para calcular una "comisión".

## Los dos modos de consentimiento

| Modo | Cuándo | Cómo vuelve el donante |
| --- | --- | --- |
| `finish` | Hay `PUBLIC_BASE_URL`. Es el de producción. | El AS lo redirige a `GET /op/callback/:id` con `hash` e `interact_ref`. |
| `poll` | No hay `PUBLIC_BASE_URL` (local). | El cliente llama a `POST /api/donations/:id/confirm` hasta que deja de responder `202`. |

El callback es un endpoint de seguridad: verifica el `hash` en tiempo constante **antes** de
tocar el grant, atiende `result=grant_rejected` como una decisión del usuario y nunca pone un
token en la URL de redirect. La URL de retorno al frontend es fija y sale de la configuración
—tomarla de un parámetro del request sería un open redirect.

## Reanudación

Un job (`DONATION_RESUME_INTERVAL_SECONDS`, 30 s por defecto) rescata lo que quedó a medias
tras un reinicio: `authorized` cuyo POST nunca se hizo, `sending` que hay que consultar y
cotizaciones caducadas. Para que sirva de algo hace falta `DONATIONS_STORE_PATH`: sin
persistencia, un reinicio pierde el continue token y el donante autoriza un pago que nadie crea.

## Migrar el store a Postgres

El contrato de `store.js` es el de este esquema. Al cambiarlo no hay que tocar `flow.js`.

```sql
CREATE TABLE donations (
  id                   UUID PRIMARY KEY,
  external_ref         TEXT NOT NULL UNIQUE,   -- idempotencia
  status               TEXT NOT NULL,

  donor_wallet_url     TEXT NOT NULL,
  fund_wallet_url      TEXT NOT NULL,
  auth_server          TEXT NOT NULL,
  resource_server      TEXT NOT NULL,
  amount_mode          TEXT NOT NULL,

  incoming_payment_id  TEXT,
  quote_id             TEXT,
  outgoing_payment_id  TEXT,
  quote_expires_at     TIMESTAMPTZ,

  -- montos: entero en TEXT + escala. Nunca NUMERIC ni FLOAT.
  debit_amount_value   TEXT,
  debit_asset_code     TEXT,
  debit_asset_scale    INT,
  receive_amount_value TEXT,
  receive_asset_code   TEXT,
  receive_asset_scale  INT,
  sent_amount_value    TEXT,

  -- credenciales: cifradas con tokens.js, jamás en claro
  ip_access_token      BYTEA,
  ip_token_manage      TEXT,
  continue_uri         TEXT,
  continue_token       BYTEA,
  continue_consumed    BOOLEAN NOT NULL DEFAULT FALSE,
  client_nonce         TEXT,
  as_nonce             TEXT,
  op_access_token      BYTEA,
  op_token_manage      TEXT,
  op_token_expires_at  TIMESTAMPTZ,

  failure_reason       TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON donations (status, created_at);
```

Dos detalles al implementarlo:

- `claimContinue` tiene que ser atómico:
  `UPDATE donations SET continue_consumed = true WHERE id = $1 AND NOT continue_consumed`
  y mirar las filas afectadas. Es lo que impide el doble cobro por recarga del navegador.
- `resumable` necesita `SELECT … FOR UPDATE SKIP LOCKED` para que dos réplicas no procesen la
  misma donación.

## Límites conocidos

- **Un solo proceso.** El store en memoria no se comparte entre réplicas; escalar en horizontal
  exige Postgres.
- **Sin rotación de tokens.** El access token del pago vive ~10 minutos y se usa en segundos;
  si expira antes del POST, la donación queda `expired` y hay que iniciar otra. La rotación
  (`token.rotate`) hace falta para cobros recurrentes, no para una donación puntual.
- **Sin rate limiting ni autenticación.** `POST /api/donations` crea recursos en el proveedor:
  en producción conviene limitarlo por IP y proteger el listado de diagnóstico.
