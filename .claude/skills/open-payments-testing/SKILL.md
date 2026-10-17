---
name: open-payments-testing
description: Probar una integración de Open Payments sin mover dinero real. Carga esta skill para configurar el test wallet de Interledger (cuenta, wallet addresses, developer keys, recargas, payment requests), levantar un Rafiki local con Docker, escribir pruebas unitarias con mocks (nock/msw) y pruebas e2e del flujo con consentimiento, y verificar la integración desde la línea de comandos. Palabras clave: test wallet, wallet.interledger-test.dev, entorno de pruebas, mocks, nock, msw, Rafiki local, pruebas e2e, sandbox, probar pagos.
---

# Probar la integración

## 1. Test wallet de Interledger

https://wallet.interledger-test.dev — fondos ficticios, mismo protocolo que producción.

### Alta

1. Crea la cuenta con un **email real** (hay verificación). El resto del KYC de prueba puede ser
   ficticio: la propia UI lo indica.
2. Confirma el correo y entra.
3. Completa el flujo de validación (datos y preguntas). Queda en revisión KYC y se aprueba.

### Preparar el entorno de pruebas

1. Crea una cuenta de moneda (p. ej. USD).
2. Crea **tres** wallet addresses en ella:
   - `client` — la que firma (va en `OP_CLIENT_WALLET_ADDRESS`)
   - `alice` — emisor
   - `bob` — receptor
3. **Recarga saldo** en la cuenta del emisor. Ojo: la recarga puede descontar comisión, así que
   el saldo final es menor que lo depositado.
4. **Settings → Developer Keys** → sobre `client`, *Generate public and private key*. Guarda el
   PEM como `private.key` y copia el **Key ID**.
5. Opcional: crea cuentas en otra moneda (EUR) para probar conversión.

### Lo que la UI te deja verificar a mano

- **Transactions** — depósitos, pagos entrantes y salientes, con su estado (`pending`,
  `completed`, `rejected`). Es donde confirmas que tu script hizo algo real.
- **Requests** — genera un link de cobro con monto y expiración. Equivale a crear un incoming
  payment; útil para probar tu lado emisor sin escribir el lado receptor.
- **Grants** — los grants activos del usuario. Aquí se ve (y se revoca) un grant recurrente:
  ideal para probar el camino "el usuario revocó" y que tu código devuelva un 403 manejado.

### Variables

```bash
# .env
OP_CLIENT_WALLET_ADDRESS=https://ilp.interledger-test.dev/client
OP_KEY_ID=<el key id de developer keys>
OP_PRIVATE_KEY_PATH=./private.key
OP_SENDER_WALLET_ADDRESS=https://ilp.interledger-test.dev/alice
OP_RECEIVER_WALLET_ADDRESS=https://ilp.interledger-test.dev/bob
OP_AMOUNT=1000
```

Verificación de humo antes de depurar nada más:

```bash
node .claude/skills/open-payments-testing/examples/smoke.mjs
```

## 2. Qué se puede probar sin llaves

El descubrimiento es público: no necesitas credenciales para probar la normalización de
direcciones ni la resolución de wallet addresses.

```js
const c = await createUnauthenticatedClient({});
await c.walletAddress.get({ url: "https://ilp.interledger-test.dev/bob" });
```

Úsalo para los tests del endpoint que valida la dirección que escribe el usuario.

## 3. Pruebas unitarias con mocks

No pegues al test wallet en CI: es lento, tiene rate limits y depende de un servicio externo.
Intercepta HTTP.

```js
// tests/payment.test.mjs — node:test + nock
import { test } from "node:test";
import assert from "node:assert/strict";
import nock from "nock";

const WA = "https://ilp.example";

test("crea el incoming payment en el servidor del receptor", async () => {
  nock(WA).get("/bob").reply(200, {
    id: `${WA}/bob`, assetCode: "USD", assetScale: 2,
    authServer: "https://auth.example", resourceServer: WA,
  });
  nock("https://auth.example").post("/").reply(200, {
    access_token: { value: "tok", manage: "https://auth.example/token/1", expires_in: 600, access: [] },
  });
  nock(WA).post("/incoming-payments").reply(201, {
    id: `${WA}/incoming-payments/1`, walletAddress: `${WA}/bob`, completed: false,
    incomingAmount: { value: "1000", assetCode: "USD", assetScale: 2 },
    receivedAmount: { value: "0", assetCode: "USD", assetScale: 2 },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });

  const result = await crearCobro({ receptor: `${WA}/bob`, monto: "1000" });
  assert.equal(result.incomingPaymentId, `${WA}/incoming-payments/1`);
  assert.ok(nock.isDone(), "faltaron peticiones esperadas");
});
```

Dos cuidados:

- Con `createAuthenticatedClient` real, los mocks también tienen que servir
  `GET /client` y `GET /client/jwks.json`, porque el constructor valida la wallet address del
  cliente. Alternativa más limpia: **inyecta el cliente** como dependencia y en los tests pasa
  un doble con los mismos métodos. Tu código de negocio no debería construir el cliente.
- Si usas `validateResponses: true`, los mocks deben cumplir el spec o el test falla por
  validación, no por tu lógica. Para fixtures parciales, desactívalo en tests.

### Qué merece test unitario

| Caso | Por qué importa |
| --- | --- |
| Normalización de wallet address (`$`, barra final, http, mayúsculas) | Es la entrada del usuario: donde más basura llega |
| Aritmética de montos con `BigInt` y escalas distintas | Un float aquí es un bug de dinero |
| `verifyInteractHash` con hash correcto, incorrecto y ausente | Es un control de seguridad |
| El continue token se consume una sola vez | Previene el doble cobro por recarga del navegador |
| Mapeo de estados (`failed`, `sentAmount >= debitAmount`, parcial) | Define qué se le cobra al cliente |
| Timeout de polling ⇒ `pending`, nunca `failed` | Previene el doble cobro por reintento |
| 403 por límite ⇒ "pedir consentimiento", no "error interno" | Es un caso de producto |

## 4. Prueba e2e con consentimiento

El consentimiento es interactivo por diseño, así que la e2e completamente automática no existe
sin automatizar un navegador. Dos estrategias:

**a) Semi-automática (recomendada para CI manual / staging):** el test imprime la URL, espera
hasta N segundos a que el grant se finalice por polling, y falla por timeout si nadie aceptó.
Es `examples/e2e-flow.mjs`.

**b) Automatizada con Playwright** contra el test wallet: abre `interact.redirect`, hace login
con credenciales de prueba y pulsa "accept". Es frágil (depende del HTML del proveedor):
márcala como test aparte y no la pongas en el camino crítico del CI.

Lo que **sí** puede ser 100% automático en CI: todo el flujo hasta `awaiting_consent`
(incoming payment + quote + grant pendiente). Cubre la mayoría de los bugs de integración.

## 5. Rafiki local

Cuando necesitas controlar las dos puntas (emisor y receptor), o probar webhooks de ASE:

```bash
git clone https://github.com/interledger/rafiki
cd rafiki
pnpm install
pnpm localenv:compose up      # levanta dos ASEs ("Cloud Nine" y "Happy Life") + Postgres + Redis
```

Esto te da dos proveedores locales con wallet addresses, auth servers y webhooks, ideal para
probar conversión de divisas y los eventos de ASE.

Con Rafiki local, los servidores pueden estar en `http://`:

```js
const client = await createAuthenticatedClient({
  walletAddressUrl: "http://localhost:3000/accounts/gfranklin",
  privateKey, keyId,
  useHttp: true,            // SOLO para local; jamás en producción
});
```

Es un proyecto de infraestructura (varios contenedores, bastante RAM). Para el 90% de los casos
el test wallet alcanza.

## 6. Pirámide de pruebas sugerida

```
      e2e manual contra test wallet (1–2 escenarios: pago feliz, usuario declina)
    integración con mocks HTTP (el flujo completo, incluido el callback)
  unitarias (montos, normalización, hash, máquina de estados, idempotencia)
```

## 7. Nunca en los tests

- Llaves privadas reales en el repo, ni siquiera de prueba. Genera una al vuelo con
  `openssl genpkey` en el setup del test, o usa un fixture claramente marcado.
- Tests que dependan de saldo en el test wallet sin verificarlo primero: el fallo sale como
  "insufficient liquidity" y se diagnostica mal.
- Snapshots de respuestas con `access_token` o `sharedSecret` dentro.

## Ejemplos

| Archivo | Qué hace |
| --- | --- |
| `examples/smoke.mjs` | Verifica config, llaves, `keyId` publicado, resolución de wallets y saldo. Lo primero que se ejecuta. |
| `examples/e2e-flow.mjs` | Flujo completo semi-automático con polling del consentimiento y assertions. |
