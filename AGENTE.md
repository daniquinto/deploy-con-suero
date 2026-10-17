# AGENTE.md — Registro del trabajo hecho con IA (rama `backend`)

Registro de lo que hizo el agente de IA en esta rama. El registro completo de la sesión
(frontend, recursos consumidos y decisiones) está en `AGENTE.md` de la rama `frontend`.

| Campo | Valor |
|---|---|
| Herramienta | Claude Code (app de escritorio de Claude) |
| Modelo | Claude Opus 5.5 (`claude-opus-5-5`) |
| Persona que lo dirige | Juan José Peña (`juanjo-77`) |

## Alcance acordado

Solo **login/registro** y **fundaciones/causas**. Las donaciones y la integración de Open Payments
(`src/open-payments/`) son de otras personas del equipo: el agente no las modifica.

## Sesión 1 — 17 oct 2026

| Qué | Archivos |
|---|---|
| Servidor Express 5, CORS, errores uniformes `{ error, details }`, `/api/health` con ping a la DB | `src/index.js`, `src/app.js`, `src/http/*` |
| Config del servidor separada de la de Open Payments (la API arranca sin las llaves de OP) | `src/config/server.js` |
| PostgreSQL con `pg` + migraciones SQL versionadas (lock para no correr dos a la vez) | `src/db/*` |
| Tablas `users`, `foundations`, `causes` | `src/db/migrations/20261017_0100_users_foundations_causes.sql` |
| Registro/login/me con bcrypt (12 rondas) y JWT; tiempo constante si el correo no existe | `src/modules/auth/auth.routes.js`, `src/auth/tokens.js` |
| Perfil de fundación y CRUD de causas (solo la dueña edita; 404 si es de otra) | `src/modules/foundations/*` |
| Scripts `start`, `dev`, `db:migrate` | `package.json` |
| Variables nuevas | `.env.example` → sección 6 |

**Dependencias agregadas:** `express@5`, `pg`, `bcryptjs`, `jsonwebtoken`, `cors`, `zod`.

**Cómo se agrega un módulo nuevo sin chocar:** crear `src/modules/<nombre>/<nombre>.routes.js`, montarlo
con una línea en `src/app.js` y, si necesita tablas, una migración nueva `AAAAMMDD_HHMM_descripcion.sql`.

## Sesión 1 (continuación)

| Qué | Archivos |
|---|---|
| CRUD de donantes sobre su propia cuenta: `GET/PATCH/DELETE /api/donors/me`, `PATCH /api/donors/me/password` | `src/modules/donors/donors.routes.js` |
| Tabla `donors` (nombres, apellidos, documento, género, país, moneda, anonimato) | `src/db/migrations/20261017_0200_donors.sql` |
| Fundación con persona responsable, tipo/número de identificación y estado `PENDIENTE/ACTIVA/SUSPENDIDA` | migración `20261017_0100_…` |
| Registro por rol (unión discriminada con zod) y 409 claro por correo, documento o NIT duplicado | `src/modules/auth/auth.routes.js` |
| Regla: solo una fundación ACTIVA crea o reactiva causas; el listado público solo muestra fundaciones activas | `src/modules/foundations/*` |
| `AUTO_ACTIVATE_FOUNDATIONS` (por defecto `true`) mientras no exista la aprobación de gobierno | `src/config/server.js`, `.env.example` |

Las migraciones solo se han aplicado en una base local de prueba; **todavía no en la VPS**. El equipo
está terminando el modelo en `main` (`docs/database/scripts.sql`): estas tablas son provisionales.

## Antes del próximo deploy (push a `backend`)

El secreto de GitHub `BACKEND_ENV_FILE` debe incluir: `DATABASE_URL`, `JWT_SECRET` (32+ caracteres)
y `CORS_ORIGINS` con el dominio del frontend. Sin `DATABASE_URL` ni `JWT_SECRET` el contenedor no arranca.
