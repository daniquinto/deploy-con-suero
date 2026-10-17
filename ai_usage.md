# Declaración de uso de IA

**Proyecto:** deploy-con-suero — rama `backend`
**Fecha:** 2026-10-17
**Herramienta:** Claude Code (CLI) · modelo **Claude Opus 5** (`claude-opus-5`)
**Alcance de esta declaración:** la sesión de trabajo del 2026-10-17 en la que se construyó el
sistema de donaciones con Open Payments. Los commits anteriores de la rama no están cubiertos
(ver la nota de método en la sección 3).

---

## 1. Prompts que se usaron, por funcionalidad

Los prompts se transcriben tal como se escribieron.

### F1 · Sistema de donaciones completo

> «Eres un desarrollador de software especializado en open finances, necesito que crees un
> endpoint para que una persona pueda conectarse y hacer un pago, que se le duelva toda la
> información necesaria, haz este flujo completo. El dinero debe de ir directamente a la cuenta
> principal de la wallet. Entonces crea todo el sistema, va a ser para donaciones. Adicionalmente
> dime como puedo probar todo.»

Resultado: el módulo `src/donations/` (flujo, store, cifrado de credenciales, verificación del
hash del callback, vistas), la API HTTP `src/http/app.js`, el arranque `src/server.js`, las 46
pruebas iniciales, el script `scripts/donate.mjs`, la documentación y las variables nuevas del
`.env.example`. Commit `be5e7d1`.

En el mismo trabajo la IA detectó y corrigió dos defectos del código que ya existía en
`src/open-payments/config.js`: una wallet address opcional vacía rompía el arranque, y
`https://$host/alias` se aceptaba aunque deja el `$` dentro del host.

### F2 · Diagnóstico del arranque

Ejecución directa en la terminal de la sesión (no fue un prompt):

> `npm start` → `ConfigError: No existe la llave privada en …/secrets/private.key`

Resultado: la IA localizó la llave en `~/Downloads/private.key`, verificó que su llave pública
correspondía al `kid` publicado en el JWKS de la wallet del cliente y la instaló en
`secrets/private.key` con permisos `600`. No se generó código.

### F3 · Explicación del efecto en las wallets

> «cuando ejecuto el npm run donate que deberia de ver reflejado en las wallets?»

Resultado: solo explicación (qué movimiento aparece en la cuenta del donante, en la del fondo y
en *Grants*, y por qué la wallet del cliente no registra nada). No se generó código.

### F4 · Depuración del consentimiento y camino de rescate

> «Mira lo que aparece, aparece pending, cuando entro en el link y le doy aceptar me lleva a
> deploy.szapatar.com. pero es a deploy.szapatar.dev. Ayudame a autenticar el pago: […salida
> completa de `npm run donate`…]»

Resultado: diagnóstico del `PUBLIC_BASE_URL` con el dominio equivocado; comprobación de qué
sirve cada ruta del dominio real; corrección del TLD y de `OP_INTERACT_FINISH_PATH` en el `.env`
local; y una funcionalidad nueva: `POST /api/donations/:id/confirm` acepta ahora `hash` e
`interact_ref` para cerrar una donación cuyo redirect no llegó al backend (y para apps móviles
con deep link), con dos pruebas más. Commits `380028a` y `681110c`.

### F5 · Colección de Postman

> «pero sabes que, ayudame para hacer una petición desde postman, para saber como hacerlo,
> entonces dime como?»

Resultado: `postman/deploy-con-suero-donaciones.postman_collection.json`, con las cinco carpetas
del flujo, variables de colección y scripts de test que guardan el `donationId`. Verificado
contra el backend en ejecución. Commit `275b3b1`.

### F6 · Guía de endpoints en producción

> «Crea un archivo .md con toda la descripción de como utilizar estos endpoints desde la url del
> deploy.szapatar.dev, necesito que especiiques uno por uno, pero no le hagas commit, no lo vamos
> a subir.»

Resultado: `ENDPOINTS-deploy-szapatar-dev.md` (sin commitear, por indicación expresa).

### F7 · Esta declaración

> «necesito que crees un archivo llamado ai_usage.md donde pongas esta información del uso de la
> IA: Prompts que se usaron por funcionalidad / Archivos que no tuvieron intervencion de Ia ia /
> Cuantos creditos te gastaste si la pagas»

Resultado: este archivo.

### Contexto adicional que consumió la IA

Las instrucciones de dominio sobre Open Payments que viven en `.claude/skills/` (creadas en una
sesión anterior) se cargaron como contexto durante F1. No se modificaron.

### Reparto del trabajo

| Lo decidió la persona | Lo produjo la IA |
| --- | --- |
| El objetivo, el alcance y que el destino fuera la cuenta principal del fondo | El diseño del flujo, el código, las pruebas y la documentación |
| La arquitectura por ramas (`backend` / `frontend` / `mobile`) y la infraestructura previa | La implementación dentro de esa estructura |
| Las cuentas del test wallet, la llave y los dominios | La verificación de que todo eso encajaba |
| La corrección del dominio (`.dev`, no `.com`) | El diagnóstico de por qué el pago quedaba colgado |
| No commitear dos archivos | El respeto de esa indicación |
| La autorización del pago en el navegador | Todo el resto del flujo |

---

## 2. Archivos con intervención de IA

Los 20 archivos de los cuatro commits de la sesión (`git diff --name-only 84875be..HEAD`):

| Archivo | Qué pasó |
| --- | --- |
| `src/donations/flow.js` | creado (922 líneas) |
| `src/donations/store.js` | creado |
| `src/donations/tokens.js` | creado |
| `src/donations/interact-hash.js` | creado |
| `src/donations/views.js` | creado |
| `src/donations/index.js` | creado |
| `src/donations/README.md` | creado |
| `src/http/app.js` | creado |
| `src/server.js` | creado |
| `scripts/donate.mjs` | creado |
| `tests/unidades.test.mjs` | creado |
| `tests/flujo.test.mjs` | creado |
| `tests/api.test.mjs` | creado |
| `tests/helpers/env.mjs` | creado |
| `postman/…postman_collection.json` | creado |
| `src/open-payments/config.js` | modificado (dos correcciones + configuración de donaciones) |
| `README.md` | ampliado (API y guía de pruebas) |
| `.env.example` | ampliado (variables nuevas) |
| `package.json` | modificado (`express`, scripts) |
| `package-lock.json` | regenerado por `npm install` |

Sin versionar, también generados por la IA en esta sesión:

| Archivo | Nota |
| --- | --- |
| `ENDPOINTS-deploy-szapatar-dev.md` | no se commitea, por indicación expresa |
| `ai_usage.md` | este archivo |
| `.env` | editado: corrección del `$` en la wallet del fondo, del TLD del dominio y de la ruta del callback (está en `.gitignore`) |
| `secrets/private.key` | **no generado**: es la llave del test wallet descargada por la persona; la IA solo la copió desde `~/Downloads` |

---

## 3. Archivos que no tuvieron intervención de IA

### Método y su límite

La lista se obtuvo comparando los archivos versionados con los que tocaron los commits de esta
sesión:

```bash
comm -23 <(git ls-files | sort) <(git diff --name-only 84875be..HEAD | sort)
```

**Advertencia honesta:** esto prueba que la IA **no los tocó en esta sesión**, no que nunca haya
intervenido en ellos. Los commits anteriores (`f12a09d` … `84875be`) no llevan la línea
`Co-Authored-By: Claude`, pero su ausencia no es prueba de nada: solo la persona que los escribió
puede declarar si usó asistencia de IA en ellos. Esta sección hay que completarla con ese
criterio.

### Archivos no tocados en esta sesión

**Infraestructura y despliegue**

- `Dockerfile`
- `docker-compose.yml`
- `docker-entrypoint.sh`
- `.dockerignore`
- `.github/workflows/deploy-backend.yml`
- `.gitignore`

**Módulo de conexión con Open Payments** (de un commit anterior; `config.js` sí se modificó)

- `src/open-payments/client.js`
- `src/open-payments/wallet-addresses.js`
- `src/open-payments/errors.js`
- `src/open-payments/health.js`
- `src/open-payments/index.js`
- `src/open-payments/README.md`
- `scripts/op-check.mjs`

**Instrucciones de dominio para la IA** (de un commit anterior; se leyeron, no se modificaron)

- `.claude/README.md`, `.claude/.env.example`
- `.claude/agents/open-payments-expert.md`
- `.claude/commands/op-diagnose.md`, `op-flow.md`, `op-setup.md`
- `.claude/skills/**` — 21 archivos entre `SKILL.md`, `references/` y `examples/`

Nada de lo escrito en esta sesión fue copiado de los `examples/` de esas skills: se usaron como
referencia del protocolo.

---

## 4. Créditos y costo

**No puedo declarar una cifra: no tengo acceso a la facturación desde dentro de la sesión.**
Poner un número aquí sería inventarlo, y en una declaración eso es peor que dejarlo en blanco.

Cómo obtener el dato real:

| Si el uso es… | Dónde se consulta |
| --- | --- |
| Esta sesión concreta | el comando `/cost` en Claude Code, que informa del consumo de la sesión |
| Una suscripción (Claude Pro / Max) | no se factura por créditos: hay límites de uso por ventana de tiempo. Lo honesto es declarar «suscripción, sin costo por petición» |
| La API de Anthropic con facturación por tokens | Anthropic Console → *Usage*, filtrando por la fecha |

Campo a completar por la persona:

```
Modalidad de pago:  ______________________  (suscripción / API por tokens / gratuita)
Costo de la sesión: ______________________  (según /cost o la consola, el 2026-10-17)
```

### Magnitud del trabajo, que sí es medible

| Métrica | Valor |
| --- | --- |
| Prompts de la persona | 6 (más una ejecución de `npm start` en la terminal de la sesión) |
| Commits | 4 (`be5e7d1`, `380028a`, `681110c`, `275b3b1`) |
| Archivos versionados creados o modificados | 20 |
| Líneas insertadas | 4 872 (`git diff --shortstat 84875be..HEAD`) |
| Líneas de código y pruebas nuevas | 3 326 (`src/donations/`, `src/http/`, `src/server.js`, `tests/`, `scripts/donate.mjs`) |
| Líneas de documentación y colección de Postman | 646 (`src/donations/README.md`, colección de Postman) |
| Pruebas automáticas añadidas | 48, todas en verde (`npm test`) |
| Modelo | Claude Opus 5 |

---

## 5. Cómo verificar esta declaración

```bash
# Commits con asistencia de IA declarada en el propio historial
git log --pretty='%h %s%n  %(trailers:key=Co-Authored-By)' 84875be..HEAD

# Qué archivos tocó cada uno
git show --stat be5e7d1

# Que lo entregado funciona
npm test
```
