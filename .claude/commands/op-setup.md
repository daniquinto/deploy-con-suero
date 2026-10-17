---
description: Prepara la integración de Open Payments en este repo (deps, .env, llave, verificación de humo)
argument-hint: "[ruta del proyecto, por defecto la raíz]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Prepara este repositorio para usar Open Payments. Objetivo: `node .claude/skills/open-payments-testing/examples/smoke.mjs` corre y pasa.

Carga la skill `open-payments-client` antes de empezar y sigue estos pasos en `${1:-.}`:

1. Revisa qué hay ya: `package.json`, `.env`, `.env.example`, `private.key`, `.gitignore`, `.dockerignore`.
2. Si falta, crea `package.json` con `"type": "module"` e instala `@interledger/open-payments`. No reinstales si ya está; reporta la versión con `npm ls`.
3. Asegura que `.gitignore` y `.dockerignore` cubran `*.key`, `.env`, `secrets/` y `*.state.json`. Si alguno falta, añádelo.
4. Comprueba con `git log --all --name-only -- '*.key' '.env'` que no haya secretos ya commiteados. Si hay, **avísalo de forma destacada**: la llave está quemada y hay que rotarla.
5. Crea o actualiza `.env.example` con las variables de `.claude/.env.example`. **No** crees `.env` con valores inventados ni toques uno existente.
6. Lista exactamente qué tiene que conseguir la persona del test wallet (wallet addresses, `private.key`, key id) y con qué pasos.
7. Ejecuta la verificación de humo. Si falla por configuración incompleta, muéstralo tal cual: no la maquilles.

No escribas lógica de pago en este comando: solo deja el entorno listo.
