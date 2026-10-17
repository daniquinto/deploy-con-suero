# `.claude/` — Agente y skills de Open Payments

Configuración de Claude Code para esta rama (`backend`), el cliente de Open Payments del
proyecto. Todo está orientado a **consumir** la API de Open Payments con
`@interledger/open-payments` en Node.js.

## Agente

| Agente | Para qué |
| --- | --- |
| [`open-payments-expert`](agents/open-payments-expert.md) | Diseñar, implementar, revisar y depurar cualquier integración de Open Payments. Conoce las nueve skills y las reglas de corrección que los tutoriales suelen equivocar. |

Se invoca solo cuando la tarea lo amerita, o explícitamente:
`"usa el agente open-payments-expert para …"`.

## Skills

| Skill | Cúbrelo cuando… |
| --- | --- |
| [`open-payments-core`](skills/open-payments-core/SKILL.md) | Hace falta el modelo mental: actores, recursos, montos, fixed-send vs fixed-receive. Incluye la **referencia HTTP completa** y un glosario con los errores de nomenclatura habituales. |
| [`open-payments-client`](skills/open-payments-client/SKILL.md) | Hay que configurar el cliente: llaves Ed25519, `keyId`, JWKS, opciones, secretos en Docker. |
| [`open-payments-grants`](skills/open-payments-grants/SKILL.md) | Hay dudas de GNAP: `access`/`actions`, `limits`, interacción, continuación, `interact_ref`, rotación de tokens. |
| [`open-payments-payment-flow`](skills/open-payments-payment-flow/SKILL.md) | Se implementa el flujo incoming payment → quote → outgoing payment. Con 3 ejemplos ejecutables. |
| [`open-payments-backend-api`](skills/open-payments-backend-api/SKILL.md) | El flujo tiene que vivir en una API HTTP con estado para `frontend` y `mobile`. Incluye un servidor Express completo. |
| [`open-payments-recurring`](skills/open-payments-recurring/SKILL.md) | Suscripciones, micropagos, streaming, paywalls, split payments. |
| [`open-payments-webhooks`](skills/open-payments-webhooks/SKILL.md) | Hay que saber si un pago avanzó: polling en el cliente vs. webhooks de la ASE. |
| [`open-payments-troubleshooting`](skills/open-payments-troubleshooting/SKILL.md) | Algo falla: 401, 403, grant no finalizado, quote expirada, PEM roto, reloj desfasado. |
| [`open-payments-testing`](skills/open-payments-testing/SKILL.md) | Test wallet, mocks, Rafiki local, pruebas e2e. Incluye un script de verificación de humo. |

## Comandos

| Comando | Qué hace |
| --- | --- |
| `/op-setup` | Deja el repo listo: dependencias, `.env.example`, `.gitignore`, verificación de humo. |
| `/op-flow <p2p\|cobro\|suscripcion\|api>` | Implementa un flujo concreto siguiendo las skills. |
| `/op-diagnose <error>` | Diagnostica un fallo con evidencia medida, no adivinada. |

## Arranque rápido

```bash
npm install @interledger/open-payments
cp .claude/.env.example .env          # completa los valores del test wallet
set -a && . ./.env && set +a
node .claude/skills/open-payments-testing/examples/smoke.mjs
node .claude/skills/open-payments-payment-flow/examples/peer-to-peer.mjs
```

Las credenciales se consiguen en https://wallet.interledger-test.dev
(*Settings → Developer Keys*). Pasos detallados en la skill `open-payments-testing`.

## Lo que estas skills corrigen del material de referencia

Las transcripciones del curso que sirvieron de base traen varios errores. Las skills documentan
la versión correcta:

- **La quote se crea en el resource server del EMISOR** (con un grant de su propio auth server),
  apuntando al incoming payment del receptor vía `receiver`. El material dice que vive en el
  servidor del receptor.
- El algoritmo de firma es **EdDSA sobre Ed25519**, no "EDSA" ni "EPSA".
- El protocolo de autorización es **GNAP**, no "NAP"; el servidor es el **AS**, no "ASK".
- En los montos el campo es **`assetCode`** (+ `assetScale`), no `currency`.
- Los recursos usan **camelCase** (`walletAddress`, `incomingAmount`); solo los bodies de GNAP
  usan snake_case (`access_token`, `interact_ref`).
- El parámetro del SDK es **`walletAddressUrl`**, no `walletAddress`.
- `method` va en minúscula: **`"ilp"`**.
- `PUT`/`DELETE` no existen para pagos: los recursos no se actualizan ni se borran.

## Límite de alcance

Estas skills construyen un **cliente**: paga, cobra y autoriza. No custodian saldos, no emiten
access tokens y no liquidan. Eso es una **ASE** (Account Servicing Entity) y se implementa
desplegando [Rafiki](https://rafiki.dev) con su infraestructura ILP y su cumplimiento KYC/AML
— un proyecto distinto, no una dependencia de npm.
