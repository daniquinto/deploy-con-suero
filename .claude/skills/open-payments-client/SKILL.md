---
name: open-payments-client
description: Configurar el cliente de Open Payments en Node.js con @interledger/open-payments. Carga esta skill para instalar el SDK, crear un cliente autenticado o no autenticado, generar y cargar el par de llaves Ed25519, obtener y usar el keyId, publicar el JWKS, resolver payment pointers, elegir opciones del cliente (validateResponses, requestTimeoutMs, logger, useHttp) y manejar los secretos con variables de entorno o Docker. Palabras clave: createAuthenticatedClient, createUnauthenticatedClient, privateKey, keyId, private.key, jwks.json, Ed25519, developer keys, firma HTTP.
---

# Configurar el cliente de Open Payments (Node.js)

## 1. Requisitos

- **Node.js 20 LTS o 22 LTS.** El SDK es ESM: usa `"type": "module"` en `package.json` o
  archivos `.mjs`.
- Tres wallet addresses para probar el flujo completo: una del **cliente** (la que firma), una
  del **emisor** y una del **receptor**. En el test wallet pueden vivir en la misma cuenta.
- Un par de llaves **Ed25519** y su `keyId`.

```bash
npm init -y
npm pkg set type=module
npm install @interledger/open-payments
```

## 2. Las tres credenciales del cliente

| Credencial | Qué es | Dónde vive |
| --- | --- | --- |
| `walletAddressUrl` | La wallet address **del cliente** (tu software), no la del emisor ni la del receptor. | Pública. |
| `privateKey` | Llave privada Ed25519 en PEM PKCS#8. Firma cada request. | **Secreta**, solo en tu backend. |
| `keyId` | Identificador que vincula tu llave privada con la pública publicada en el JWKS. | Público. |

El servidor recibe la petición, lee el `keyid` del header `Signature-Input`, descarga
`{walletAddressUrl}/jwks.json`, encuentra esa llave pública y verifica la firma. Eso prueba
**autenticidad** (eres quien dices) e **integridad** (el body no se alteró).

Como un cliente puede tener varias llaves publicadas a la vez, el `keyId` también es el
mecanismo de **rotación**: publicas la nueva, cambias el `keyId` de tu config, y recién después
revocas la vieja.

## 3. Obtener las llaves

### Opción A — test wallet (lo normal para desarrollar)

1. Entra a https://wallet.interledger-test.dev y crea la cuenta (el email debe ser real; el
   resto del KYC de prueba puede ser ficticio).
2. Crea al menos tres wallet addresses en la misma cuenta de moneda (p. ej. USD): `client`,
   `alice`, `bob`.
3. **Settings → Developer Keys** → elige la cuenta → **Generate public and private key** sobre
   la wallet address del *cliente*. Ponle un nombre descriptivo.
4. La llave privada se descarga sola. Copia su contenido a `private.key` en tu proyecto.
5. Expande la llave en la UI para copiar el **Key ID**.

### Opción B — generarlas tú (producción o self-hosted)

```bash
openssl genpkey -algorithm ed25519 -out private.key
openssl pkey -in private.key -pubout -out public.pem
```

El PEM privado debe verse así:

```
-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIB…
-----END PRIVATE KEY-----
```

Si es `BEGIN RSA PRIVATE KEY` o `BEGIN EC PRIVATE KEY`, es la curva equivocada: Open Payments
solo acepta Ed25519. Luego hay que **subir la pública** al proveedor (en el test wallet,
"Upload key") o publicar tu propio JWKS si tú mismo sirves la wallet address del cliente
(ver `references/keys-and-jwks.md`).

## 4. Crear el cliente

```js
import { createAuthenticatedClient } from "@interledger/open-payments";

const client = await createAuthenticatedClient({
  walletAddressUrl: process.env.OP_CLIENT_WALLET_ADDRESS, // https://…, sin barra final, sin "$"
  privateKey: process.env.OP_PRIVATE_KEY_PATH ?? "private.key",
  keyId: process.env.OP_KEY_ID,
});
```

`createAuthenticatedClient` es **async**: devuelve una promesa porque valida la wallet address
y carga la llave. `await`-éala una sola vez al arrancar el proceso y reutiliza el cliente; no
crees uno por request.

### `privateKey` acepta tres formas

```js
privateKey: "private.key"                                  // ruta a un archivo PEM
privateKey: process.env.OP_PRIVATE_KEY                      // el PEM completo en una variable
privateKey: crypto.createPrivateKey(pem)                    // un KeyObject de node:crypto
```

Si la pasas por variable de entorno, los saltos de línea del PEM se suelen perder. Dos salidas
seguras:

```js
// a) guardar el PEM en base64 y decodificarlo
const pem = Buffer.from(process.env.OP_PRIVATE_KEY_B64, "base64").toString("utf8");

// b) guardar \n literales y restaurarlos
const pem = process.env.OP_PRIVATE_KEY.replace(/\\n/g, "\n");
```

Leer de archivo con `fs.readFileSync(path, "utf8")` también funciona; usa `fs` síncrono (no
`fs/promises`) si lo haces en el arranque: es una sola lectura y simplifica el orden de inicio.

### Opciones del cliente

```js
const client = await createAuthenticatedClient({
  walletAddressUrl,
  privateKey,
  keyId,
  validateResponses: true,   // valida contra el OpenAPI spec. true en dev, false en prod caliente.
  requestTimeoutMs: 10_000,  // default suele ser 5000; súbelo si el proveedor es lento
  logLevel: "debug",         // "silent" | "error" | "warn" | "info" | "debug" (según versión)
  useHttp: false,            // SOLO true para un Rafiki local en http://
});
```

`validateResponses: true` atrapa pronto incompatibilidades de versión del proveedor, pero
cuesta CPU y puede rechazar respuestas válidas si el proveedor va por delante del spec que
trae tu SDK. Verifica qué opciones existen en tu versión:

```bash
npm ls @interledger/open-payments
sed -n '1,120p' node_modules/@interledger/open-payments/dist/client/index.d.ts
```

### Cliente no autenticado

Para lo que es público —resolver una wallet address, leer su JWKS o consultar la vista pública
de un incoming payment— no necesitas llaves:

```js
import { createUnauthenticatedClient } from "@interledger/open-payments";

const publicClient = await createUnauthenticatedClient({ requestTimeoutMs: 5000 });

const wa = await publicClient.walletAddress.get({ url: "https://ilp.interledger-test.dev/bob" });
const keys = await publicClient.walletAddress.getKeys({ url: wa.id });
const ip = await publicClient.incomingPayment.getPublic({ url: incomingPaymentUrl });
```

Úsalo en cualquier endpoint que valide una wallet address que el usuario escribió: así no gastas
firmas ni expones el cliente autenticado.

## 5. Normalizar la entrada del usuario

La gente pega `$alias`, `http://`, barras finales y espacios. Normaliza siempre antes de llamar
al SDK:

```js
export function toWalletAddressUrl(input) {
  const raw = String(input).trim();
  let url;
  if (raw.startsWith("$")) {
    const rest = raw.slice(1);
    url = rest.includes("/") ? `https://${rest}` : `https://${rest}/.well-known/pay`;
  } else {
    url = raw.startsWith("http") ? raw : `https://${raw}`;
  }
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("La wallet address debe ser https://");
  if (u.search || u.hash) throw new Error("La wallet address no admite query ni fragment");
  u.pathname = u.pathname.replace(/\/+$/, "") || "/.well-known/pay";
  return u.toString().replace(/\/$/, "");
}
```

Un error muy común: **el `id` que devuelve el servidor puede no ser idéntico a la URL que
pediste** (canonicalización). Usa siempre `walletAddress.id` —no tu string de entrada— en los
bodies de incoming payment, quote y outgoing payment.

## 6. Manejo de secretos en este repo

El backend corre en Docker (`docker-compose.yml`, usuario `node`, puerto 3000). Pautas:

- `private.key`, `.env` y `*.key` **nunca** se commitean. Confirma que estén en `.gitignore`
  y en `.dockerignore`.
- En la VPS, monta la llave como archivo de solo lectura en vez de hornearla en la imagen:

```yaml
services:
  backend:
    environment:
      OP_CLIENT_WALLET_ADDRESS: ${OP_CLIENT_WALLET_ADDRESS}
      OP_KEY_ID: ${OP_KEY_ID}
      OP_PRIVATE_KEY_PATH: /run/secrets/op_private_key
    volumes:
      - ./secrets/private.key:/run/secrets/op_private_key:ro
```

- Valida la config al arrancar y **falla rápido**: un proceso vivo con `keyId` vacío produce
  401 incomprensibles más tarde.

```js
for (const k of ["OP_CLIENT_WALLET_ADDRESS", "OP_KEY_ID"]) {
  if (!process.env[k]) throw new Error(`Falta la variable de entorno ${k}`);
}
```

## 7. Verificación de humo

```js
import { createUnauthenticatedClient } from "@interledger/open-payments";
const c = await createUnauthenticatedClient({});
const wa = await c.walletAddress.get({ url: process.env.OP_CLIENT_WALLET_ADDRESS });
const { keys } = await c.walletAddress.getKeys({ url: wa.id });
console.log(
  "keyId publicado:", keys.map((k) => k.kid),
  "| coincide con OP_KEY_ID:", keys.some((k) => k.kid === process.env.OP_KEY_ID),
);
```

Si `coincide` es `false`, toda petición firmada devolverá 401. Arregla eso antes de seguir.

## Referencias

- `references/sdk-api.md` — todos los métodos del cliente con sus firmas.
- `references/keys-and-jwks.md` — formato de llaves, JWKS propio, rotación y revocación.
