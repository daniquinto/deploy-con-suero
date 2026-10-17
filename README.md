# deploy-con-suero — backend

## ¿Qué es Open Finance?

Open Finance es el modelo en el que los sistemas financieros se comunican entre sí mediante
estándares abiertos, en lugar de operar como "islas" incompatibles. Hoy una transferencia
internacional puede tardar de 3 a 5 días y costar entre 20 y 50 USD en comisiones, y más de
1.000 millones de personas siguen fuera del sistema bancario.

La implementación práctica de esa idea son dos piezas de la Fundación Interledger:

- **Interledger (ILP):** protocolo abierto y neutral —no es una criptomoneda ni un banco— que
  conecta ledgers distintos (bancos, billeteras, blockchains). Divide el pago en paquetes de
  valor que viajan por conectores, que enrutan y convierten divisas. La entrega se asegura con
  transferencia de dos fases (secreto + hash): si un salto falla, la operación se revierte.
  El enrutamiento va a velocidad de internet y la liquidación ocurre después, fuera del protocolo.
- **Open Payments:** la API REST estándar sobre ILP. Identifica cuentas con una **wallet address**
  (URL de la cuenta) y un **payment pointer** (alias tipo `$alias`), y autoriza con **GNAP**, de
  modo que la aplicación recibe un token y nunca ve las credenciales del usuario.

El resultado: una sola integración para llegar a bancos, billeteras y dinero móvil, con costos
visibles, micropagos viables y pagos que se sienten tan simples como enviar un correo.

## Estructura del proyecto

El proyecto se divide en tres ramas, una por capa:

| Rama | Responsabilidad |
| --- | --- |
| `frontend` | Interfaz web que el usuario usa para pagar y autorizar. |
| `backend` | Servidor que integra la API de Open Payments y guarda las llaves. |
| `mobile` | App móvil con el mismo flujo, pensada para pagos en el celular. |

## Esta rama: `backend`

Es el cliente de Open Payments: el servidor que habla con los proveedores de cuentas (ASE).

- Firma las peticiones con la **llave privada** del cliente y resuelve wallet addresses.
- Crea los recursos del flujo: `incoming payment` → `quote` → `outgoing payment`.
- Negocia los **grants GNAP**, guarda y renueva los tokens de acceso.
- Expone una API propia para `frontend` y `mobile`, y recibe los webhooks del proveedor.

Es el único componente con acceso a secretos; las capas de interfaz nunca los ven.

## El sistema de donaciones

El backend expone una API propia para que una persona conecte su wallet, autorice un cargo y el
dinero entre **directo a la cuenta principal del fondo** (`OP_FUND_WALLET_ADDRESS`). El destino
sale de la configuración, nunca del request: no hay cuentas intermedias ni custodia nuestra.

El detalle del flujo, la máquina de estados y el esquema SQL están en
[`src/donations/README.md`](src/donations/README.md).

### Endpoints

| Método y ruta | Para qué |
| --- | --- |
| `GET /api/fund` | A dónde va el dinero: wallet del fondo, moneda, escala, límites y montos sugeridos. Lo que el formulario necesita para dibujarse. |
| `POST /api/wallet/connect` | "Conectarse": valida la wallet address del donante y devuelve su moneda; avisa si habrá conversión. No firma nada. |
| `POST /api/donations` | Inicia la donación: crea cobro, cotización y grant interactivo. Devuelve `interact.redirectUrl`, los dos montos y los ids de los recursos. |
| `GET /api/donations/:id` | Estado, para el polling del frontend o la app. |
| `POST /api/donations/:id/confirm` | Solo en modo polling (sin `PUBLIC_BASE_URL`): "el donante ya autorizó". |
| `POST /api/donations/:id/cancel` | Cancela antes de que salga el dinero: cierra el cobro, cancela el grant y revoca los tokens. |
| `GET /op/callback/:id` | Lo llama el **authorization server** en el navegador del donante. Verifica el `hash`, continúa el grant y crea el pago. |
| `GET /healthz` · `GET /health/op` | Liveness (no toca la red) y diagnóstico completo de la conexión. |
| `GET /api/donations` | Listado de diagnóstico. En producción debería ir detrás de autenticación. |

Los secretos —llave privada, access tokens, continue token— **nunca** salen del backend. El
frontend solo ve el `donationId`, la URL de consentimiento, los montos y los ids de los
recursos de Open Payments.

### Ejemplo de uso

```bash
# 1. ¿A dónde va el dinero?
curl -s localhost:3000/api/fund

# 2. Conectar la wallet del donante
curl -s -X POST localhost:3000/api/wallet/connect \
  -H 'Content-Type: application/json' \
  -d '{"walletAddress":"$ilp.interledger-test.dev/donante"}'

# 3. Donar: devuelve interact.redirectUrl, lo que paga el donante y lo que recibe el fondo
curl -s -X POST localhost:3000/api/donations \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: donacion-001' \
  -d '{
        "donorWalletAddress": "$ilp.interledger-test.dev/donante",
        "amount": "10",
        "amountMode": "send",
        "description": "Donación de emergencia",
        "donorName": "Ana"
      }'

# 4. Abrir interact.redirectUrl en el navegador y aceptar el cargo.

# 5. Seguir el estado hasta que sea final
curl -s localhost:3000/api/donations/<donationId>
```

`amountMode` elige quién fija el monto: `send` (por defecto) debita exactamente lo que dijo el
donante —lo que una persona espera que se le cobre— y `receive` hace que al fondo lleguen
exactamente esos 10, pagando el donante las comisiones.

## Cómo probar todo

### 1. Pruebas automáticas (sin red, sin llaves, sin dinero)

```bash
npm install
npm test          # 46 pruebas: montos, hash del callback, cifrado, flujo y API HTTP
```

Usan un cliente de Open Payments falso y una llave Ed25519 generada al vuelo, así que corren en
cualquier máquina y en CI. Cubren lo que no se puede comprobar a mano sin arriesgar dinero: que
cada grant vaya al authorization server correcto, que el destino sea siempre el fondo, que un
`hash` inválido no continúe el grant, que recargar el callback no cobre dos veces, que un
timeout no se confunda con un fallo y que un 4xx no se reintente.

### 2. Verificación de la configuración (no mueve dinero)

```bash
cp .env.example .env     # completa OP_KEY_ID, las wallets y TOKEN_ENC_SECRET
npm run op:check
```

Valida el `.env`, que la llave privada sea Ed25519, que `OP_KEY_ID` esté publicado en el JWKS de
la wallet del cliente (si no, **toda** petición firmada dará 401) y que las wallets resuelvan.
Con el servidor levantado, el equivalente por HTTP es `GET /health/op`.

Las credenciales de desarrollo salen de <https://wallet.interledger-test.dev> →
*Settings → Developer Keys*: guarda la llave privada en `secrets/private.key` y copia su
**Key ID** a `OP_KEY_ID`.

### 3. Donación real de punta a punta contra el test wallet

```bash
npm start                       # terminal 1
npm run donate                  # terminal 2
npm run donate -- --amount 2.50 --mode receive
npm run donate -- --donor '$ilp.interledger-test.dev/otra-wallet'
```

`scripts/donate.mjs` maneja la API por HTTP igual que lo hará el frontend: pide los datos del
fondo, conecta la wallet del donante, inicia la donación, imprime la URL de consentimiento y
espera el resultado. Al final verifica en el test wallet que la cuenta del donante muestre el
pago saliente y la del fondo el entrante.

Según la configuración, el consentimiento se cierra de dos maneras:

- **Con `PUBLIC_BASE_URL`** (producción): el authorization server devuelve al donante a
  `GET /op/callback/:id`. Tiene que ser una URL `https` que el navegador del donante alcance.
- **Sin `PUBLIC_BASE_URL`** (local): modo polling. El script llama a
  `POST /api/donations/:id/confirm` hasta que el consentimiento aparece. Es la forma de probar
  en `localhost` sin exponer nada a internet.

Para probar el callback de verdad en local, expón el puerto con un túnel
(`cloudflared tunnel --url http://localhost:3000`) y pon esa URL en `PUBLIC_BASE_URL`.

Dos detalles del callback que cuestan una tarde si se pasan por alto:

- **`PUBLIC_BASE_URL` tiene que ser el dominio exacto del backend.** El authorization server
  manda al donante a donde diga esa variable; si el dominio está mal, el donante autoriza y el
  callback no llega a ningún sitio: la donación se queda en `awaiting_consent` hasta que la
  cotización caduca.
- **La ruta del callback debe llegar al backend, no al frontend.** Si nginx sirve el frontend en
  `/` y solo proxea `/api/*`, pon `OP_INTERACT_FINISH_PATH=/api/op/callback` y no hace falta
  tocar el proxy.

Si una donación se quedó colgada pero el donante **sí** autorizó, se puede cerrar pasando los
parámetros que el AS puso en el redirect (están en la barra de direcciones del navegador):

```bash
curl -s -X POST localhost:3000/api/donations/<donationId>/confirm   -H 'Content-Type: application/json'   -d '{"hash":"<hash>","interact_ref":"<interact_ref>"}'
```

Es el mismo camino verificado que el callback —comprueba el hash y consume el continue token una
sola vez— y es también cómo una app móvil cierra el flujo cuando intercepta su propio deep link.
Solo funciona si la cotización no ha caducado.

### 4. Los caminos que no son el feliz

| Qué probar | Cómo |
| --- | --- |
| El donante declina | En la pantalla del proveedor, pulsa rechazar. La donación queda `cancelled` y no se cobra nada. |
| Callback falsificado | `curl "localhost:3000/op/callback/<id>?hash=falso&interact_ref=x"` → 400, y la donación sigue en `awaiting_consent`. |
| Doble envío del formulario | Repite el `POST /api/donations` con la misma `Idempotency-Key` → 200 con la misma donación, no una segunda. |
| Recarga del callback | Vuelve a abrir la URL del callback → el estado no cambia y no hay un segundo pago. |
| Cotización caducada | Inicia una donación y espera `DONATION_EXPIRY_MINUTES` sin autorizar → `expired`. |
| Saldo insuficiente | Dona más de lo que tiene la wallet del donante → el pago falla con un motivo legible. |
| Reinicio a medio pago | Con `DONATIONS_STORE_PATH` definido, reinicia el proceso tras autorizar: el job de reanudación crea el pago que faltaba. |
| Grant revocado | Revoca el grant desde *Grants* en el test wallet y consulta el estado. |

### 5. En Docker

```bash
docker compose up -d --build
docker compose logs -f backend
curl -s localhost:3000/health/op
```

La llave privada se monta como secreto de solo lectura en `/run/secrets/op_private_key`: el
archivo `./secrets/private.key` **debe existir** antes del `up`, o Docker crea un directorio con
ese nombre y el arranque falla con "no es un PEM PKCS#8".

Para no perder donaciones a medio camino en un reinicio, persiste el store:

```yaml
    environment:
      DONATIONS_STORE_PATH: /app/data/donations.json
    volumes:
      - ./data:/app/data
```
