---
description: Diagnostica un error de Open Payments (401, grant no finalizado, quote expirada, etc.)
argument-hint: "[mensaje de error o descripción del síntoma]"
allowed-tools: Read, Bash, Grep, Glob
---

Diagnostica este problema de Open Payments: **$ARGUMENTS**

Carga la skill `open-payments-troubleshooting` y trabaja así:

1. Clasifica el síntoma: ¿falla **toda** petición firmada (problema de identidad del cliente) o **una sola** llamada (problema de URL, token, estado o payload)?
2. Reúne evidencia con comandos reales, no suposiciones:
   - `npm ls @interledger/open-payments`
   - `curl -sH "Accept: application/json" <walletAddress> | jq`
   - `curl -s <clientWalletAddress>/jwks.json | jq '.keys[].kid'`
   - `openssl pkey -in private.key -text -noout | head -3`
   - `date -u` dentro y fuera del contenedor
   - `grep` del código para ver qué `url` y qué `accessToken` recibe la llamada que falla
3. Para cada llamada sospechosa verifica: servidor correcto (emisor vs receptor), token del grant correcto con la acción correcta, grant finalizado, montos como string entero en la escala correcta, quote vigente.
4. Da **una** causa probable con la evidencia que la sostiene, y el arreglo concreto. Si la evidencia no alcanza, di qué falta medir en vez de adivinar.
5. Si pegas logs, redacta `Signature`, `Authorization`, `access_token`, `continue.access_token` y `sharedSecret`.

Recuerda lo que **no** es un error: `sentAmount: "0"` recién creado, `receivedAmount: "0"` sin pagos aún, y un timeout de polling (es `pending`, no `failed`).

Solo lee y mide. No cambies código sin que la persona lo pida.
