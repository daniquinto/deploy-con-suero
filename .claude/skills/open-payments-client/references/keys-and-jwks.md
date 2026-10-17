# Llaves, JWKS, firma y rotación

## Formato exigido

- Algoritmo: **EdDSA** sobre **Ed25519** (`alg: "EdDSA"`, `kty: "OKP"`, `crv: "Ed25519"`).
- Llave privada: PEM **PKCS#8** (`-----BEGIN PRIVATE KEY-----`).
- Nada de RSA ni de curvas NIST. Las transcripciones que dicen "EDSA" o "EPSA" se refieren a EdDSA.

```bash
# generar
openssl genpkey -algorithm ed25519 -out private.key
# inspeccionar (debe decir ED25519)
openssl pkey -in private.key -text -noout | head -3
```

## Cómo se firma una petición (lo que el SDK hace por ti)

Open Payments usa **HTTP Message Signatures (RFC 9421)**:

1. Se arma una cadena canónica con los componentes firmados: `@method`, `@target-uri`,
   `content-digest`, `content-length`, `content-type`, `authorization` (cuando aplica).
2. Se calcula `Content-Digest: sha-512=:…:` sobre el body.
3. Esa cadena se firma con la llave privada Ed25519.
4. Se envían dos headers:

```
Signature-Input: sig1=("@method" "@target-uri" "content-digest" "content-length" "content-type");keyid="<keyId>";created=1760000000;alg="ed25519"
Signature: sig1=:<firma base64>:
```

El servidor lee `keyid`, descarga `{clientWalletAddress}/jwks.json`, toma la llave con ese `kid`
y verifica. Si coincide ⇒ autenticidad + integridad.

**Implicaciones prácticas:**

- `created` hace que la firma caduque: si el reloj del contenedor va desfasado más de ~60 s,
  todo falla con 401. Sincroniza NTP.
- La firma cubre el body: cualquier proxy que reescriba, recomprima o reordene el JSON la rompe.
  No pongas un API gateway que toque el payload entre tu cliente y el proveedor.
- `GET` sin body también se firma; no hay excepciones.

Si necesitas firmar a mano (otro runtime, o verificar firmas entrantes):

```js
import { createHeaders, loadKey } from "@interledger/http-signature-utils";

const privateKey = loadKey("private.key");
const headers = await createHeaders({
  request: { method: "POST", url, headers: { "content-type": "application/json" }, body },
  privateKey,
  keyId,
});
```

## Publicar tu propio JWKS

Solo lo necesitas si **tú** sirves la wallet address del cliente (self-hosted). Con el test
wallet o una ASE, el proveedor lo publica por ti.

El endpoint es `{walletAddress}/jwks.json`, público, sin auth, `application/json`:

```json
{
  "keys": [
    {
      "kid": "1b4a4a3b-…",
      "alg": "EdDSA",
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "<llave pública en base64url, 32 bytes>"
    }
  ]
}
```

Generarlo desde el PEM:

```js
import crypto from "node:crypto";
import fs from "node:fs";

const priv = crypto.createPrivateKey(fs.readFileSync("private.key", "utf8"));
const jwk = crypto.createPublicKey(priv).export({ format: "jwk" }); // { kty:"OKP", crv:"Ed25519", x }
const keys = [{ ...jwk, kid: process.env.OP_KEY_ID, alg: "EdDSA" }];
fs.writeFileSync("jwks.json", JSON.stringify({ keys }, null, 2));
```

Sírvelo con cache corto (`Cache-Control: max-age=300`): los proveedores cachean las llaves, y un
TTL largo retrasa las rotaciones.

## Rotación sin downtime

1. Genera el par nuevo y **añádelo** al JWKS (quedan dos llaves publicadas).
2. Espera a que expire el cache de los proveedores (minutos).
3. Cambia `OP_KEY_ID` + `OP_PRIVATE_KEY` de tu cliente a la llave nueva y redespliega.
4. Verifica que las peticiones firmadas con la nueva pasan.
5. Elimina o revoca la vieja del JWKS.

Nunca borres la llave vieja antes del paso 4: si hay que hacer rollback del deploy, el binario
anterior firma con un `keyId` que ya no existe.

## Si la llave privada se filtra

1. Revoca la llave en el proveedor (test wallet: *Developer Keys → Revoke*) o quítala del JWKS.
2. Revoca los access tokens activos: `client.token.revoke({ url: token.manage, accessToken })`.
3. Cancela los grants pendientes: `client.grant.cancel({ url: continue.uri, accessToken })`.
4. Genera llave nueva y redespliega.

Un access token sigue siendo válido aunque revoques la llave: la llave autentica al cliente,
el token autoriza el acceso. Hay que atacar las dos cosas.

## Checklist de higiene

- [ ] `*.key`, `.env`, `secrets/` en `.gitignore` **y** en `.dockerignore`.
- [ ] La llave privada no se hornea en la imagen Docker: se monta como secreto `:ro`.
- [ ] `git log -p --all -- '*.key'` no muestra nada (si muestra, la llave está quemada aunque la borres).
- [ ] Llaves distintas por entorno (dev / staging / prod).
- [ ] El proceso falla al arrancar si falta `keyId` o la llave.
