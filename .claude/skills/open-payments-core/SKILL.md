---
name: open-payments-core
description: Fundamentos de Interledger y Open Payments que hay que tener claros antes de escribir código. Carga esta skill cuando se pregunte qué es Open Payments, ILP, GNAP, una wallet address, un payment pointer, un incoming payment, una quote o un outgoing payment; qué actores y servidores existen (resource server, authorization server, IdP, ASE); cómo se representan los montos con assetCode y assetScale; la diferencia entre fixed-send y fixed-receive; o cuándo se necesita Rafiki en lugar del SDK cliente.
---

# Open Payments: modelo mental y contrato de la API

## 1. Dónde encaja cada pieza

| Pieza | Qué es | Qué NO es |
| --- | --- | --- |
| **Interledger (ILP)** | Protocolo de transporte de valor. Parte el pago en paquetes, los enruta por conectores y garantiza entrega con una transferencia de dos fases (el receptor genera un secreto, los paquetes llevan su hash, los fondos se liberan al revelar el secreto; si un salto falla, se revierte). | No es una criptomoneda, ni un banco, ni una red de pagos. |
| **Open Payments** | API REST estándar **encima** de ILP: descubre cuentas, pide permisos y crea los recursos de pago. | No mueve el dinero por sí misma. |
| **Liquidación (settlement)** | El movimiento real de fondos entre entidades reguladas, en lotes y **fuera** del protocolo. | No es instantánea por definición; ILP solo es mensajería rápida. |
| **Rafiki** | Implementación de referencia que una ASE despliega para *exponer* Open Payments. | No es lo que usas para *consumir* la API. Para eso está el SDK cliente. |
| **Web Monetization** | Estándar de navegador que paga contenido usando Open Payments por debajo. | — |

Analogía útil: ILP es la autopista, Open Payments es el auto, y la liquidación es la
contabilidad que los bancos cierran después.

## 2. Actores y servidores

- **Cliente**: cualquier software que hace peticiones a la API (e-commerce, app de propinas,
  backend de streaming). Se identifica con **su propia wallet address** y firma cada request.
- **Usuario / resource owner**: la persona dueña de la cuenta, que da consentimiento.
- **ASE (Account Servicing Entity)**: banco, billetera o proveedor de dinero móvil. Está
  regulada, hace KYC/AML y liquida. Agrupa cuatro servicios:
  - **Wallet address server**: sirve el endpoint público de la wallet address.
  - **Resource server**: guarda incoming payments, quotes y outgoing payments.
  - **Authorization server (AS)**: implementa GNAP y emite access tokens.
  - **Identity provider (IdP)**: autentica al usuario y recoge su consentimiento.

El cliente nunca ve credenciales del usuario: la autorización ocurre entre el usuario y su
propia ASE.

## 3. Los cuatro recursos

| Recurso | Lado | Protegido por grant | Para qué sirve |
| --- | --- | --- | --- |
| **Wallet address** | ambos | **No, es público** | Descubrimiento: moneda, escala y URLs de los servidores. |
| **Incoming payment** | receptor | sí | "Estoy listo para recibir X". Es el recibo/boleto digital. |
| **Quote** | emisor | sí | Cuánto se debita, cuánto llega y con qué comisiones. Expira. |
| **Outgoing payment** | emisor | sí (**interactivo**) | La instrucción de pago ya consentida. |

### Wallet address y payment pointer

- **Wallet address**: URL `https://` que identifica la cuenta, p. ej.
  `https://ilp.interledger-test.dev/alice`. Es el endpoint técnico y **nunca lleva barra final**.
- **Payment pointer**: alias legible que empieza con `$`, p. ej. `$ilp.interledger-test.dev/alice`.
  Reglas de resolución:
  - `$host/path` → `https://host/path`
  - `$host` (sin path) → `https://host/.well-known/pay`
  Al SDK siempre le pasas la forma `https://`.
- Un `GET` con `Accept: application/json` sobre la wallet address devuelve:

```json
{
  "id": "https://ilp.interledger-test.dev/alice",
  "publicName": "Alice",
  "assetCode": "USD",
  "assetScale": 2,
  "authServer": "https://auth.interledger-test.dev",
  "resourceServer": "https://ilp.interledger-test.dev"
}
```

Un usuario puede tener **varias** wallet addresses apuntando a la misma cuenta (privacidad).

### Montos: `assetCode` + `assetScale` + `value`

Siempre es un entero **en string** interpretado como `value / 10^assetScale`:

```js
// 10,00 USD con escala 2
{ assetCode: "USD", assetScale: 2, value: "1000" }
```

Regla de oro: guarda y transporta enteros; formatea solo al mostrar. Nunca uses `Number` para
aritmética de dinero: usa `BigInt`.

```js
const fmt = (a) =>
  (Number(BigInt(a.value)) / 10 ** a.assetScale).toLocaleString("es", {
    style: "currency", currency: a.assetCode,
  });
```

### Fixed-receive vs fixed-send

- **Fixed-receive**: el incoming payment declara `incomingAmount`. El receptor recibe exactamente
  eso y el emisor paga comisiones y conversión. Es el caso típico de facturas y e-commerce.
- **Fixed-send**: el incoming payment se crea **sin** `incomingAmount` y la quote declara
  `debitAmount`. El emisor fija lo que sale de su cuenta y el receptor recibe lo que llegue
  después de comisiones. Es el caso típico de propinas, donaciones y remesas.

Nunca definas `incomingAmount` y `debitAmount` a la vez esperando que coincidan.

## 4. La secuencia canónica de un pago

```
                RECEPTOR (Bob)                        EMISOR (Alice)
cliente  ──1── GET wallet address  ───────────────────── GET wallet address
cliente  ──2── grant incoming-payment (AS de Bob)
cliente  ──3── POST /incoming-payments (RS de Bob)
cliente  ──4── ───────────────────────────────────────── grant quote (AS de Alice)
cliente  ──5── ───────────────────────────────────────── POST /quotes (RS de Alice)
cliente  ──6── ───────────── grant outgoing-payment INTERACTIVO (AS de Alice)
usuario  ──7── ───────────── consiente en el IdP (redirect)
cliente  ──8── ───────────── continue → access token final
cliente  ──9── ───────────────────────────────────────── POST /outgoing-payments (RS de Alice)
         ─10── ILP transporta; las ASE liquidan fuera del protocolo
```

**La quote se crea del lado del EMISOR** (su resource server, su grant), apuntando al incoming
payment del receptor vía `receiver`. Si lees lo contrario en un tutorial, está mal.

## 5. Qué NO está en el estándar

- No hay reembolsos, disputas ni chargebacks: eso lo resuelve la ASE.
- No hay webhooks hacia el cliente. El cliente **consulta** (`GET`) el recurso. Los webhooks
  (`incoming_payment.completed`, `outgoing_payment.failed`, …) los emite Rafiki hacia *su propia*
  ASE. Ver `open-payments-webhooks`.
- No hay anonimato: la liquidación ocurre en entidades reguladas con KYC/AML.
- Las comisiones no desaparecen: siguen existiendo costos de transacción y de conversión. La
  quote es el lugar donde se vuelven visibles antes de confirmar.

## Referencias

- `references/api-reference.md` — endpoints HTTP, campos y respuestas de cada recurso.
- `references/glossary.md` — glosario ES/EN y errores de nomenclatura comunes.
- Docs oficiales: https://openpayments.dev · Spec: https://openpayments.dev/apis/resource-server/operations
