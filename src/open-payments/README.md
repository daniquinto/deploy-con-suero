# `src/open-payments/` — módulo de conexión

Capa de conexión con la API de Open Payments para **deploy-con-suero**: lee la configuración
del `.env`, crea el cliente del SDK una sola vez por proceso, resuelve wallet addresses y
traduce los fallos del proveedor a mensajes con causa y acción.

Es lo único del backend que toca `process.env` y lo único que instancia el SDK. La capa de
flujo de pago (incoming payment → quote → outgoing payment) se construye encima y solo importa
`index.js`.

## Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `config.js` | Lee y **valida** el `.env` al arrancar; carga la llave Ed25519 (archivo, base64 o PEM inline) y normaliza wallet addresses. Falla rápido con mensajes accionables. |
| `client.js` | `getClient()` (autenticado, firma cada petición) y `getPublicClient()` (no autenticado, para lo público). Memoizados por proceso. |
| `wallet-addresses.js` | Resolver wallet addresses con caché TTL, validar la que escribe un donante o un comercio, y convertir montos (`toAmount`, `formatAmount`). |
| `health.js` | `checkConnection()`: diagnostica si la instancia puede mover dinero, sin moverlo. |
| `errors.js` | `ConfigError`, `OpenPaymentsConnectionError` y la traducción de 400/401/403/404/409/422 a causa probable + qué revisar. |
| `index.js` | Superficie pública del módulo. Importar siempre desde aquí. |

## Puesta en marcha

```bash
npm install
cp .env.example .env            # completa OP_KEY_ID, las wallets y TOKEN_ENC_SECRET
npm run op:check                # verificación de humo: no mueve dinero
```

Las credenciales de desarrollo se sacan de <https://wallet.interledger-test.dev>
(*Settings → Developer Keys*): descarga la llave privada a `secrets/private.key` y copia su
**Key ID** a `OP_KEY_ID`.

> El repo trae un par Ed25519 generado localmente en `secrets/` (ignorado por git) para que
> `op:check` pueda ejecutarse. **No sirve para firmar**: o lo reemplazas por la llave
> descargada del test wallet, o subes su pública al proveedor. Mientras no coincida con una
> `kid` del JWKS, el chequeo `keyId-en-jwks` saldrá en rojo y toda petición firmada dará 401.

## Uso

```js
import {
  initOpenPayments,
  getClient,
  resolveFundWalletAddress,
  resolvePair,
  toAmount,
  formatAmount,
  config,
} from "./src/open-payments/index.js";

// En el arranque del servidor: un .env mal puesto se nota aquí, no en la primera donación.
await initOpenPayments();

// Donación: del donante (lo escribe en el frontend) al fondo de la plataforma.
const { sender, receiver, sameAsset } = await resolvePair(donorInput, config.wallets.fund);
const client = await getClient();

// Gasto trazable: del fondo al comercio local.
const merchant = await resolveFundWalletAddress();
const monto = toAmount("25.000", merchant);     // -> { value: "2500000", assetCode: "COP", assetScale: 2 }
console.log(formatAmount(monto));
```

Reglas que este módulo da por sentadas y conviene no romper en la capa de flujo:

- La **quote se crea en el resource server del emisor**, con un grant de *su* auth server,
  apuntando al incoming payment del receptor vía `receiver`.
- En los bodies va siempre `walletAddress.id` (la URL canónica del servidor), no la cadena que
  escribió la persona.
- Los montos son **enteros en string** con `assetCode` + `assetScale`. Nunca pasarlos por
  `Number` para hacer cuentas de dinero.
- El grant de outgoing payment es **interactivo**: necesita el consentimiento del donante en
  `interact.redirect` y luego `grant.continue` con el `interact_ref`. De ahí que
  `PUBLIC_BASE_URL` tenga que ser https pública.

## Diagnóstico

`checkConnection()` devuelve `{ ok, config, checks }` y está pensado también para un endpoint:

```js
app.get("/health/op", async (_req, res) => {
  const report = await checkConnection();
  res.status(report.ok ? 200 : 503).json(report);
});
```

El chequeo que más tiempo ahorra es `keyId-en-jwks`: si `OP_KEY_ID` no está publicado en
`{OP_CLIENT_WALLET_ADDRESS}/jwks.json`, **todas** las peticiones firmadas devuelven 401 y el
mensaje del proveedor no explica por qué.
