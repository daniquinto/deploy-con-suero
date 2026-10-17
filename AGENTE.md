# AGENTE.md — Registro del trabajo hecho con IA

Este archivo documenta **qué hizo el agente de IA, con qué herramientas y qué recursos consumió**,
para tener trazabilidad en el hackathon. Se actualiza en cada sesión de trabajo.

## Agente

| Campo | Valor |
|---|---|
| Herramienta | Claude Code (app de escritorio de Claude, pestaña Code) |
| Modelo | Claude Opus 5.5 (`claude-opus-5-5`) |
| Plan | Claude Pro |
| Persona que lo dirige | Juan José Peña (`juanjo-77`) |
| Repositorio | `daniquinto/deploy-con-suero` · ramas `frontend` y `backend` |

## Reglas que sigue el agente

- No hace `push`: cada push a `frontend` o `backend` **despliega a la VPS**. Solo commitea cuando se le pide.
- No guarda secretos en el repo: `.env`, llaves y conexiones a la DB quedan en archivos ignorados por git.
- En `backend` solo toca **login/registro y fundaciones/causas**; donaciones y Open Payments son de otras personas del equipo.
- Prueba en el navegador cada flujo que construye antes de darlo por terminado.

---

## Sesión 1 — 17 oct 2026

### Rama `frontend` (esta carpeta)

| Qué | Archivos |
|---|---|
| App React + TypeScript + Vite + React Router desde cero, compatible con el Dockerfile existente (build a `dist/`) | `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` |
| Flujo donante: landing → registro/ingreso → causas → detalle → donar → mis donaciones | `src/pages/*` |
| Registro con **rol** (donante o fundación) y wallet address opcional | `src/pages/AuthPage.tsx`, `src/auth/*` |
| Panel de fundación: **Mis causas** (resumen, cerrar/reactivar) y **Crear causa** con validación | `src/pages/MyCausesPage.tsx`, `src/pages/CreateCausePage.tsx` |
| Capa de datos con dos implementaciones intercambiables: demo (localStorage) y real (HTTP al backend) | `src/services/api.ts`, `mockApi.ts`, `httpApi.ts` |
| Rebrand a **Mano Abierta**: logo vectorial, favicon, colores del logo (verde, durazno, crema) y tipografía Figtree | `src/components/Logo.tsx`, `public/favicon.svg`, `src/index.css` |

### Rama `backend` (worktree en `../deploy-con-suero-backend`)

| Qué | Archivos |
|---|---|
| Servidor Express 5 con manejo de errores uniforme (`{ error, details }`) | `src/index.js`, `src/app.js`, `src/http/*` |
| Conexión a PostgreSQL (pool `pg`) y migraciones SQL versionadas que corren al arrancar | `src/db/pool.js`, `src/db/migrate.js`, `src/db/migrations/*` |
| Tablas `users`, `foundations`, `causes` | `src/db/migrations/20261017_0100_users_foundations_causes.sql` |
| Auth: registro, login y `me` con bcrypt (12 rondas) + JWT | `src/modules/auth/auth.routes.js`, `src/auth/tokens.js` |
| Fundaciones y causas: perfil, crear/listar/editar/cerrar causas, vistas públicas | `src/modules/foundations/*` |
| Variables nuevas documentadas | `.env.example` (sección 6) |

**Endpoints creados:**

```
POST  /api/auth/register            POST /api/auth/login            GET /api/auth/me
GET   /api/causes                   GET  /api/causes/:id            GET /api/foundations/:id
GET   /api/foundations/me           PATCH /api/foundations/me
GET   /api/foundations/me/causes    POST /api/foundations/me/causes PATCH /api/foundations/me/causes/:id
GET   /api/health
```

### Otros entregables de la sesión (fuera del repo)

- Boceto de diseño de 7 pantallas (artifact de Claude, privado): <https://claude.ai/artifact/WLAK2TqTNv7pUH4BnLSk5H>
- Demo de aprendizaje de Open Payments en PHP + React (carpeta `Desktop/open_payments`), con una transferencia real EUR → COP probada en la test wallet.

### Recursos consumidos

| Recurso | Uso |
|---|---|
| Tokens de IA | ~528.000 tokens de contexto en la sesión (53 % de la ventana de 1M); 16 % del límite de 5 h y 17 % del semanal del plan Pro al momento de registrar |
| Paquetes npm (frontend) | `react`, `react-dom`, `react-router-dom`, `vite`, `@vitejs/plugin-react`, `typescript`, tipos de React |
| Paquetes npm (backend) | `express@5`, `pg`, `bcryptjs`, `jsonwebtoken`, `cors`, `zod` |
| Servicios externos | Google Fonts (Figtree), test wallet de Interledger (`wallet.interledger-test.dev`), prototipo de Figma del equipo (solo lectura) |
| Herramientas del agente | Lectura/escritura de archivos, PowerShell (npm, git, PHP), navegador integrado para probar la app, lienzo de diseño (artifacts) |

---

## Sesión 1 (continuación) — 17 oct 2026: rediseño, donantes y reglas de negocio

### Decisiones tomadas con el equipo

- **Datos quemados** en el frontend por tiempo: cuentas `donador@gmail.com` y `fundacion@gmail.com`, contraseña `password`.
- El login pide elegir **donante o fundación**; si no coincide con la cuenta, se rechaza. El donante entra al listado de causas.
- Las fundaciones se registran solas desde el registro (no las crea una entidad). Admin y gobierno: **solo vistas funcionales** con datos de ejemplo.
- Registro según el diseño del equipo: donante (nombres, apellidos, tipo/número de documento, género) y fundación (nombre, persona responsable, tipo/número de identificación). La wallet se agrega luego desde el perfil.

### Reglas de negocio implementadas

| Regla | Dónde |
|---|---|
| La fundación nace PENDIENTE; solo ACTIVA crea/publica causas | Backend (`requireActive`) y frontend |
| Solo causas de fundaciones ACTIVAS aparecen en el listado público | Backend y modo demo |
| Wallet válida obligatoria para donar | Pantalla de donar |
| Monto mínimo de 1 USD (o equivalente) | Pantalla de donar |
| Mientras no exista la aprobación de gobierno, `AUTO_ACTIVATE_FOUNDATIONS=true` activa al registrarse | Backend `.env` |

### Frontend

| Qué | Archivos |
|---|---|
| Sistema visual completo (tokens del logo, inputs con ícono, botones, tarjetas, badges, animación con `prefers-reduced-motion`) | `src/index.css`, `src/components/ui.tsx` |
| Login y registro nuevos según el diseño (rol, campos con ícono, ver contraseña, confirmación, errores por campo, atajo de cuentas de prueba) | `src/pages/AuthPage.tsx` |
| Rediseño de landing, causas, detalle, donar, mis donaciones, mis causas y crear causa (con vista previa) | `src/pages/*` |
| Nueva página **Mi perfil** del donante: datos, wallet y preferencias, cambiar contraseña, eliminar cuenta | `src/pages/DonorProfilePage.tsx` |
| Vistas de demostración **Gobierno** (activar/suspender fundaciones) y **Admin** (registrar entidades) | `src/pages/GovernmentPage.tsx`, `src/pages/AdminPage.tsx` |
| Dependencia nueva: `lucide-react` (íconos) | `package.json` |

### Backend (worktree `../deploy-con-suero-backend`, sin commit)

| Qué | Archivos |
|---|---|
| **CRUD de donantes**: ver, editar, cambiar contraseña, eliminar cuenta | `src/modules/donors/donors.routes.js` |
| Tabla `donors` y campos nuevos de fundación (responsable, tipo/número de identificación, estado) | `src/db/migrations/*` |
| Registro con los campos nuevos y duplicados de documento/NIT → 409 | `src/modules/auth/auth.routes.js` |

Probado contra una PostgreSQL local en Docker (`mano-abierta-db`): registro, login, CRUD de donante, causas y la regla de fundación PENDIENTE (403).

### Recursos consumidos (acumulado)

~709.000 tokens de contexto en la sesión (71 % de la ventana); 46 % del límite de 5 h y 22 % del semanal del plan Pro al registrar.
Docker Desktop (contenedor `postgres:16-alpine` para pruebas locales).

### Pendiente / decisiones abiertas

- Alinear el backend con el modelo de base de datos de `main` (`docs/database/scripts.sql`) cuando el equipo lo termine; mis tablas son provisionales.

- Conectar el backend a la PostgreSQL de la VPS (falta `DATABASE_URL`) y agregar `DATABASE_URL` y `JWT_SECRET` al secreto `BACKEND_ENV_FILE` de GitHub antes del próximo deploy del backend.
- `raised` y `donationsCount` de cada causa salen en 0 hasta que exista la tabla de donaciones (otra parte del equipo).
- La sesión usa JWT en `localStorage`; para producción conviene evaluar cookie `HttpOnly`.
