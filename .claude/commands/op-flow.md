---
description: Implementa un flujo de pago con Open Payments (p2p, cobro, suscripción o API HTTP)
argument-hint: "<p2p | cobro | suscripcion | api> [detalles]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Implementa un flujo de Open Payments para: **$ARGUMENTS**

Procedimiento:

1. Carga `open-payments-payment-flow`. Añade según el caso:
   - `api` → también `open-payments-backend-api`
   - `suscripcion` → también `open-payments-recurring`
   - dudas sobre permisos o interacción → también `open-payments-grants`
2. Mira qué hay en el repo antes de escribir: estructura, framework, dónde se inicializa el cliente. Reutiliza lo que exista en lugar de duplicarlo.
3. Decide y **di explícitamente** fixed-receive o fixed-send, y por qué.
4. Escribe el código con:
   - una sola instancia del cliente por proceso,
   - URLs y tokens etiquetados por dueño (emisor / receptor) en cada llamada,
   - `isFinalizedGrant` / `isPendingGrant` antes de tocar `access_token` o `interact`,
   - `limits.debitAmount = quote.debitAmount` y `limits.receiver` en el grant interactivo,
   - manejo de `OpenPaymentsClientError`,
   - confirmación por consulta del recurso (el POST no confirma nada),
   - secretos desde variables de entorno.
5. Verifica la sintaxis (`node --check`) de lo que escribas y, si es ejecutable sin credenciales, ejecútalo.
6. Cierra con: qué variables de entorno hacen falta, qué pasos manuales quedan, y qué **no** quedó implementado.

Si el requerimiento implica custodiar saldos o emitir tokens, dilo: eso es una ASE y se hace con Rafiki, no con este SDK.
