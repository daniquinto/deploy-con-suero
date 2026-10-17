# Glosario y trampas de nomenclatura

## Términos

| ES | EN | Definición corta |
| --- | --- | --- |
| Dirección de billetera | Wallet address | URL `https://` que identifica una cuenta y expone moneda + URLs de servidores. Pública. |
| Puntero de pago | Payment pointer | Alias `$host/path` que resuelve a la wallet address. |
| Pago entrante | Incoming payment | Recurso del receptor que declara disposición a recibir. |
| Cotización | Quote | Cálculo con validez limitada de debitAmount / receiveAmount / comisiones. |
| Pago saliente | Outgoing payment | Instrucción de pago consentida, del lado del emisor. |
| Concesión | Grant | Permiso GNAP sobre recursos y acciones concretas. |
| Token de acceso | Access token | Credencial emitida por el AS, validada por el resource server. |
| Entidad administradora de cuenta | ASE / ACE (Account Servicing Entity) | Banco, billetera o dinero móvil: regulada, hace KYC/AML y liquida. |
| Servidor de autorización | AS (Authorization Server) | Implementa GNAP y emite tokens. |
| Servidor de recursos | RS (Resource Server) | Almacena los tres recursos protegidos. |
| Proveedor de identidad | IdP | Autentica al usuario y recoge consentimiento. |
| Compensación | Clearing | Ajuste de saldos entre conectores. |
| Liquidación | Settlement | Movimiento real de fondos, en lotes, fuera del protocolo. |
| Conector | Connector | Nodo que enruta paquetes ILP y convierte divisas. |
| Escala del activo | Asset scale | Decimales implícitos del monto entero. |

## Errores de nomenclatura que circulan en tutoriales y transcripciones

| Se ve escrito | Lo correcto |
| --- | --- |
| "EDSA", "EPSA", "ECDSA" | **EdDSA** sobre curva **Ed25519**. |
| "NAP", "ASK" | **GNAP** (Grant Negotiation and Authorization Protocol); **AS** (authorization server). |
| "ACE", "ASE", "ASE/ACE" mezclados | **ASE** = Account Servicing Entity. Es el término de la spec. |
| "la quote se crea en el servidor del receptor" | Se crea en el **resource server del emisor**, con grant del **AS del emisor**. |
| `"currency": "USD"` en el monto | El campo es **`assetCode`**, y va junto a `assetScale`. |
| `wallet_address`, `incoming_amount` (snake_case) | En los recursos es **camelCase**: `walletAddress`, `incomingAmount`. Solo los bodies de **GNAP** usan snake_case (`access_token`, `interact_ref`). |
| `"method": "ILP"` | En minúscula: **`"ilp"`**. |
| `PUT` / `DELETE` para actualizar o borrar pagos | Los recursos no se actualizan ni se borran. Lo único parecido es `POST .../complete` en un incoming payment. |
| `walletAddress` como parámetro de `createAuthenticatedClient` | El parámetro es **`walletAddressUrl`**. |
| Open Payments = Open Banking | Son cosas distintas: Open Banking es regulación regional de acceso a datos bancarios; Open Payments es un estándar abierto de iniciación de pagos sobre ILP. |
| "Interledger es una criptomoneda" | Es un protocolo, agnóstico de moneda y de ledger. |

## Convención snake_case vs camelCase

- **GNAP (authorization server)**: `access_token`, `expires_in`, `interact_ref`, `continue`.
- **Open Payments (resource server)**: `walletAddress`, `incomingAmount`, `receiveAmount`,
  `debitAmount`, `sentAmount`, `quoteId`, `expiresAt`, `createdAt`.

Confundirlas produce errores de validación silenciosos: el campo se ignora y el recurso sale mal.
