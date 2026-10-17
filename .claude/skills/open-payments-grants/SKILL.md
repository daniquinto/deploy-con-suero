---
name: open-payments-grants
description: Dominar GNAP en Open Payments: solicitar grants, elegir type/actions/limits, grants no interactivos vs interactivos con redirect, la continuación del grant (interact_ref, nonce, hash, wait), rotar y revocar access tokens, cancelar grants y aplicar mínimo privilegio. Carga esta skill cuando aparezcan grant.request, grant.continue, isPendingGrant, isFinalizedGrant, access_token, interact, continue.uri, token.rotate, token.revoke, pending grant, grant no finalizado o errores 401/403 de autorización.
---

# GNAP: grants y access tokens en Open Payments

GNAP (*Grant Negotiation and Authorization Protocol*) es lo que reemplaza a OAuth 2.0 aquí.
Diferencias que importan:

- **No hay `client_id` ni `client_secret`.** El cliente se identifica por su wallet address y
  firma cada petición con su llave privada.
- **El cliente declara exactamente qué quiere**: recursos (`type`), acciones (`actions`) y, para
  pagos salientes, **límites** (`limits`).
- **La interacción del usuario es parte del protocolo**, no un parche: un grant puede quedar
  pendiente hasta que la persona consienta en su IdP.

## 1. Anatomía de una solicitud de grant

```js
const grant = await client.grant.request(
  { url: walletAddress.authServer },     // el AS del dueño del recurso
  {
    access_token: {
      access: [
        { type: "incoming-payment", actions: ["create", "read", "complete"] },
      ],
    },
    // interact: { … }   ← solo para outgoing-payment
  },
);
```

Dos reglas que resuelven la mayoría de los 401/403:

1. **El `authServer` es el del dueño del recurso**, no el tuyo. Grant de incoming payment ⇒ AS
   del receptor. Grants de quote y outgoing payment ⇒ AS del emisor.
2. **El token de un grant solo sirve para las acciones de ese grant.** No reutilices el token
   del incoming payment para crear la quote.

### `type` y `actions` válidas

| `type` | `actions` | ¿Interactivo? | `limits` |
| --- | --- | --- | --- |
| `incoming-payment` | `create`, `read`, `read-all`, `complete`, `list`, `list-all` | no | no |
| `quote` | `create`, `read`, `read-all` | no | no |
| `outgoing-payment` | `create`, `read`, `read-all`, `list`, `list-all` | **sí** | sí |

- Pide **solo** lo que vas a usar. `["create"]` si solo creas; añade `"read"` si vas a consultar
  el recurso después (lo necesitas para hacer polling del outgoing payment).
- `read-all` / `list-all` alcanzan recursos de **otros** clientes y normalmente exigen
  interacción del usuario incluso para `incoming-payment`. Evítalas salvo que construyas un
  agregador.

### Varios accesos en un solo grant

```js
await client.grant.request(
  { url: sender.authServer },
  {
    access_token: {
      access: [
        { type: "quote", actions: ["create", "read"] },
        {
          type: "outgoing-payment",
          actions: ["create", "read"],
          identifier: sender.id,
          limits: { debitAmount: { assetCode: "USD", assetScale: 2, value: "1030" } },
        },
      ],
    },
    interact: { start: ["redirect"] },
  },
);
```

Esto ahorra un viaje, pero **contamina**: al incluir `outgoing-payment` el grant entero se vuelve
interactivo, así que ya no puedes crear la quote antes de que el usuario consienta — y necesitas
la quote para saber el `debitAmount` del límite. Por eso el flujo canónico usa **grants
separados**: quote primero (no interactivo), outgoing payment después (interactivo, con el
límite exacto que devolvió la quote).

Combinar `quote` + `outgoing-payment` en un grant sí tiene sentido cuando el límite lo fijas tú
por política (p. ej. "hasta 50 USD al mes") y no a partir de una quote concreta.

### `limits` e `identifier` (solo `outgoing-payment`)

```js
{
  type: "outgoing-payment",
  actions: ["create", "read"],
  identifier: sender.id,            // la wallet address que se debita
  limits: {
    debitAmount:   { assetCode: "USD", assetScale: 2, value: "1030" },  // máximo a debitar
    receiveAmount: { assetCode: "USD", assetScale: 2, value: "1000" },  // máximo a entregar
    receiver: incomingPayment.id,    // ata el grant a UN destino
    interval: "R12/2026-01-01T00:00:00Z/P1M",  // ventana repetida
  },
}
```

- `debitAmount` y `receiveAmount` son **techos**, no montos exactos. Un grant con techo de
  1030 permite varios pagos mientras la suma no lo exceda.
- `receiver` es la mejor defensa contra un token robado: lo deja inútil para pagar a otro.
- `interval` es un **intervalo repetido ISO 8601** y reinicia el consumo del techo en cada
  período. Es la base de las suscripciones (ver `open-payments-recurring`).
- `identifier` evita que el mismo grant se use contra otra wallet address del mismo usuario.

Mínimo privilegio en la práctica: `identifier` + `receiver` + `debitAmount` exacto de la quote
⇒ el token solo sirve para *ese* pago.

## 2. Grants no interactivos (incoming payment y quote)

El AS los aprueba al instante:

```js
import { isFinalizedGrant } from "@interledger/open-payments";

const grant = await client.grant.request(
  { url: receiver.authServer },
  { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read", "complete"] }] } },
);

if (!isFinalizedGrant(grant)) {
  throw new Error("Se esperaba un grant finalizado para incoming-payment");
}
const token = grant.access_token.value;
```

**No te saltes el `isFinalizedGrant`.** Sin él, TypeScript no te deja acceder a `access_token`
y en JavaScript obtienes `undefined` → un 401 confuso tres llamadas después. Es exactamente el
error que aparece al ejecutar el script sin importar la utilidad.

Un grant finalizado trae:

```js
{
  access_token: {
    value:   "<el token>",
    manage:  "https://auth…/token/<id>",   // para rotar/revocar
    expires_in: 600,                        // segundos
    access: [ /* el eco de lo concedido */ ],
  },
  continue: { access_token: { value }, uri },   // puede venir, para rotar vía continue
}
```

Guarda `manage` y `expires_in` si el token va a vivir más de una request.

## 3. Grants interactivos (outgoing payment)

### Paso 1 — pedir el grant con interacción

```js
import crypto from "node:crypto";

const nonce = crypto.randomUUID();

const pending = await client.grant.request(
  { url: sender.authServer },
  {
    access_token: {
      access: [{
        type: "outgoing-payment",
        actions: ["create", "read"],
        identifier: sender.id,
        limits: { debitAmount: quote.debitAmount },
      }],
    },
    interact: {
      start: ["redirect"],
      finish: {
        method: "redirect",
        uri: "https://tu-backend.example/op/callback",  // a dónde vuelve el usuario
        nonce,                                          // guárdalo asociado a la sesión
      },
    },
  },
);
```

Respuesta pendiente:

```js
{
  interact: {
    redirect: "https://auth…/interact/<id>/<nonce>",  // manda al usuario AQUÍ
    finish:   "<nonce del AS>",                        // sirve para verificar el hash
  },
  continue: {
    access_token: { value: "<continue token>" },
    uri: "https://auth…/continue/<id>",
    wait: 5,                                           // segundos mínimos antes de reintentar
  },
}
```

Qué persistir mientras el usuario está en el navegador: `continue.uri`,
`continue.access_token.value`, `interact.finish`, tu `nonce`, el `quote.id` y tu referencia de
orden. El `continue` token es **secreto**: no lo pongas en la URL de redirect ni en el frontend.

### `finish` o no `finish`

| Con `interact.finish` | Sin `interact.finish` |
| --- | --- |
| El AS redirige al usuario a tu `uri` con `?hash=…&interact_ref=…`. | El usuario se queda en la pantalla del proveedor. |
| `grant.continue` **exige** `{ interact_ref }`. | `grant.continue` se llama **sin body**. |
| Es lo correcto para web y móvil: UX continua y determinista. | Sirve para CLIs y scripts: el usuario vuelve manualmente y tú haces polling. |

El script de ejemplo del curso usa la segunda variante con `readline` + Enter. Para un backend
real usa **siempre** `finish`.

### Paso 2 — el usuario consiente

Rediriges a `pending.interact.redirect`. El IdP autentica a la persona, le muestra el monto
("La tienda quiere debitar 10,30 USD") y recoge aceptar/declinar.

### Paso 3 — verificar el callback

Tu endpoint recibe `?hash=<h>&interact_ref=<ref>`. **Verifica el hash antes de continuar**: es
lo que impide que un tercero invente un callback.

```js
import crypto from "node:crypto";

// El hash_base concatena los cuatro valores separados por "\n". Las
// implementaciones difieren en si incluyen el salto FINAL: aceptamos ambas y,
// una vez comprobado cuál usa tu AS, se deja solo esa.
function verifyInteractHash({ clientNonce, asNonce, interactRef, grantEndpoint, hash }) {
  if (!hash || !interactRef) return false;
  const norm = (s) =>
    Buffer.from(String(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  const given = norm(hash);
  const base = `${clientNonce}\n${asNonce}\n${interactRef}\n${grantEndpoint}`;
  for (const candidate of [base, `${base}\n`]) {
    const expected = norm(crypto.createHash("sha-256").update(candidate).digest("base64url"));
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) return true;
  }
  return false;
}
```

- `clientNonce` — el `nonce` que generaste.
- `asNonce` — `pending.interact.finish`.
- `grantEndpoint` — la URL del AS a la que hiciste el POST inicial (`sender.authServer`).
- Compara en tiempo constante y rechaza con 400 si no coincide.

### Paso 4 — continuar el grant

```js
import { isFinalizedGrant, OpenPaymentsClientError } from "@interledger/open-payments";

let finalized;
try {
  finalized = await client.grant.continue(
    { url: saved.continueUri, accessToken: saved.continueToken },
    { interact_ref: interactRef },     // omitir solo si NO pediste finish
  );
} catch (err) {
  if (err instanceof OpenPaymentsClientError) {
    // 401 → el usuario no consintió todavía, o el continue token ya se consumió
    // 404 → el grant expiró o ya fue continuado: hay que reiniciar el flujo
    throw new Error(`No se pudo continuar el grant (${err.status}): ${err.description}`);
  }
  throw err;
}

if (!isFinalizedGrant(finalized)) {
  // sigue pendiente: respeta continue.wait antes de reintentar
  throw new Error("El grant sigue pendiente de interacción");
}

const outgoingToken = finalized.access_token.value;
```

Puntos finos:

- **El `continue` es de un solo uso.** Si lo reintentas con el mismo `interact_ref`, da 404.
  Marca tu registro como consumido en la misma transacción de base de datos.
- **Respeta `continue.wait`.** Hacer polling antes del tiempo indicado puede devolver 429 o
  invalidar el grant. Si haces polling (flujo sin `finish`), usa backoff: `wait`, `wait*2`, …
- El grant pendiente **expira**. Si el usuario abandona, limpia el registro y, si puedes,
  `client.grant.cancel`.

### Polling (flujo sin `finish`)

```js
async function pollGrant(client, { continueUri, continueToken, wait = 5, maxMs = 300_000 }) {
  const deadline = Date.now() + maxMs;
  let delay = wait * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay));
    try {
      const g = await client.grant.continue({ url: continueUri, accessToken: continueToken });
      if (isFinalizedGrant(g)) return g;
    } catch (err) {
      if (!(err instanceof OpenPaymentsClientError) || err.status !== 401) throw err;
      // 401 = aún sin consentir; seguimos esperando
    }
    delay = Math.min(delay * 2, 30_000);
  }
  throw new Error("Timeout esperando el consentimiento del usuario");
}
```

## 4. Ciclo de vida del access token

```js
// rotar antes de que expire (devuelve un token nuevo e invalida el anterior)
const rotated = await client.token.rotate({ url: token.manage, accessToken: token.value });

// revocar cuando terminas
await client.token.revoke({ url: token.manage, accessToken: token.value });
```

- `expires_in` llega en **segundos**; conviértelo a timestamp absoluto al guardarlo.
- Rota con margen (p. ej. al 80% de la vida), no cuando ya recibiste el 401.
- **Revoca** los tokens de un pago puntual en cuanto se completa. Los de un grant recurrente se
  conservan y se rotan.
- Rotar **cambia el valor**: hay que persistir el nuevo `value` y el nuevo `manage` juntos y de
  forma atómica, o pierdes el control del token.

## 5. Almacenamiento y seguridad

- Los access tokens y el continue token son **credenciales portadoras**: cifrados en reposo,
  nunca en logs, nunca hacia el frontend.
- Loguea identificadores de recurso (`incomingPayment.id`, `quote.id`), jamás `access_token.value`.
- Un grant por intención de pago. No compartas grants entre usuarios ni entre órdenes.
- Al cancelar una orden: `incomingPayment.complete` + `token.revoke` + `grant.cancel` si aplica.

## Referencia

- `references/gnap-flows.md` — diagramas de secuencia, bodies HTTP crudos y matriz de decisión
  (interactivo vs no interactivo, con `finish` vs polling, grant único vs recurrente).
