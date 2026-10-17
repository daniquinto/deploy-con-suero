# Ayuda Humanitaria App — Definición de requisitos

**Fecha:** 17 de octubre de 2026 · **Versión:** 1.0 (hackathon Open Payments)

## Resumen

**Problema:** en una emergencia, las donaciones tardan semanas en llegar a las familias afectadas, se pierden en intermediarios y el donante nunca sabe si su ayuda llegó.

**Solución:** la aplicación usa Open Payments para que cualquier persona done desde cualquier país en su moneda, y para que las fundaciones gasten esa ayuda en minutos en comercios locales desde la aplicación, rastreando cada gasto que se realiza.

**Impacto:** la ayuda llega en minutos en lugar de semanas, reactiva la economía local del municipio afectado y le muestra al donante exactamente en qué se convirtió su dinero.

---

## 1. Propósito del proyecto

La aplicación garantiza que las donaciones frente a desastres naturales o emergencias humanitarias lleguen rápido, fácil y de forma transparente a quienes las necesitan.

- **Destinada a:** entidades gubernamentales, fundaciones que atienden emergencias y cualquier persona que desee donar, desde cualquier país.
- **Objetivo:** acceso rápido y fácil a donaciones frente a desastres naturales o emergencias humanitarias.
- **Valor diferencial:** transparencia y confianza. Cada peso donado se puede rastrear hasta el gasto en que se convirtió.

### Alcance

**Dentro del alcance:** registro y activación de entidades y fundaciones, donaciones transfronterizas, liberación de fondos a fundaciones, pagos y transferencias a comercios, evidencias y rechazos de gasto, y trazabilidad pública para el donante.

**Fuera del alcance:** las historias listadas en la sección 3, devoluciones de donaciones, facturación electrónica y verificación de identidad (KYC), que se delega a las billeteras.

---

## 2. Actores y roles

Cada usuario pertenece a un solo rol.

| Rol | Quién es | Qué puede hacer |
| --- | --- | --- |
| Dueño del negocio (ADMIN) | Operador de la plataforma | Registrar entidades gubernamentales, suspender cuentas, auditar |
| Entidad gubernamental | Oficina de gestión del riesgo municipal, departamental o nacional | Registrar, activar y suspender fundaciones; verificar evidencias; rechazar gastos |
| Fundación | Organización que atiende la emergencia | Crear causas, recibir fondos, pagar a comercios y transferir, subir evidencias |
| Donante (usuario) | Persona o empresa en cualquier país | Ver causas recientes, donar en su moneda, ver en qué se gastó su dinero |

---

## 3. Historias de usuario

| ID | Historia | Criterios de aceptación |
| --- | --- | --- |
| HU-01 | Como dueño de negocio, quiero registrar entidades gubernamentales para brindarles acceso al sistema | Solo un ADMIN puede registrarlas. Se crea el usuario con rol GOBIERNO y la entidad queda ligada a quien la registró. El NIT no se puede repetir. |
| HU-02 | Como entidad gubernamental, quiero registrar fundaciones para que tengan una wallet registrada donde puedan recibir dinero | La fundación queda ligada a la entidad que la registra. La wallet address se valida contra Open Payments antes de guardarse. Nace en estado PENDIENTE. |
| HU-03 | Como entidad gubernamental, quiero activar determinadas fundaciones para que puedan recibir donaciones | Solo la entidad que registró la fundación puede activarla o suspenderla. Al activarla se guarda la fecha. Solo una fundación ACTIVA aparece para los donantes. |
| HU-04 | Como fundación, quiero poder recibir dinero de diferentes donantes a través del mundo para recolectar fondos | Las donaciones en cualquier moneda se convierten con un quote. Los fondos se liberan a la wallet de la fundación y se reflejan en el recaudo de la causa. |
| HU-05 | Como fundación, quiero poder procesar transferencias y pagos a comercios para comprar los suministros necesarios | El pago sale de la wallet de la fundación mediante su grant. No puede superar el saldo liberado ni el límite del grant. Un pago bloqueado genera un rechazo con su motivo. |
| HU-06 | Como usuario, quiero donarle a una fundación para aportar en la emergencia/causa de forma monetaria | El donante ve el quote en su moneda, autoriza en su billetera y recibe confirmación y un enlace de trazabilidad. |
| HU-07 | Como usuario, quiero poder ver los desastres más recientes en el mundo para ofrecer mis donaciones | Se listan las causas activas ordenadas por fecha del evento, con país, tipo, meta y avance del recaudo. |
| HU-08 | Como usuario, quiero visualizar en qué se ha gastado mi dinero para tener mayor transparencia | El enlace de trazabilidad muestra los gastos de la causa con categoría, comercio, monto, fecha y evidencias, sin datos personales de beneficiarios. |

### Fuera de alcance

- Como entidad gubernamental, quiero activar fundaciones por poblaciones demográficas para facilitar el proceso de activación.
- Como fundación, quiero poder recibir postulaciones de servicios gratuitos de personas que deseen ayudar para conseguir recursos humanos gratis en la emergencia.

---

## 4. Requisitos funcionales

| ID | Requisito | Historia |
| --- | --- | --- |
| RF-01 | El sistema permite al ADMIN crear entidades gubernamentales con su usuario de acceso. | HU-01 |
| RF-02 | El sistema permite iniciar sesión con correo y contraseña y redirige según el rol. | HU-01 a HU-08 |
| RF-03 | La entidad gubernamental puede crear fundaciones con su usuario y wallet address. | HU-02 |
| RF-04 | El sistema valida la wallet address consultándola en Open Payments (moneda y escala). | HU-02, HU-06 |
| RF-05 | La entidad puede cambiar el estado de sus fundaciones: PENDIENTE, ACTIVA o SUSPENDIDA. | HU-03 |
| RF-06 | La fundación activa puede crear, publicar, pausar y cerrar causas. | HU-04, HU-07 |
| RF-07 | La fundación otorga a la aplicación un grant de pago saliente con límite e intervalo. | HU-05 |
| RF-08 | El donante puede donar a una causa activa en su moneda, con quote previo y autorización en su billetera. | HU-06 |
| RF-09 | El sistema confirma la donación cuando el incoming payment se completa y actualiza el recaudo. | HU-04, HU-06 |
| RF-10 | El sistema libera cada donación completada a la wallet de la fundación y actualiza el monto liberado. | HU-04 |
| RF-11 | La fundación registra pagos a comercios y transferencias, que se ejecutan con Open Payments. | HU-05 |
| RF-12 | El sistema registra un rechazo cuando un gasto no se puede ejecutar, con origen y motivo. | HU-05 |
| RF-13 | La fundación puede adjuntar evidencias a cada gasto; la entidad puede verificarlas. | HU-05, HU-08 |
| RF-14 | El sistema lista las causas activas del mundo ordenadas por fecha del evento. | HU-07 |
| RF-15 | Cada donación genera un enlace público de trazabilidad con los gastos de su causa. | HU-08 |

---

## 5. Reglas de negocio

| ID | Regla |
| --- | --- |
| RN-01 | Solo el ADMIN registra entidades gubernamentales. |
| RN-02 | Solo una entidad gubernamental registra fundaciones, y solo la entidad que la registró puede activarla o suspenderla. |
| RN-03 | Una fundación solo recibe donaciones y crea causas cuando está ACTIVA. |
| RN-04 | Si una fundación se suspende, sus causas pasan a PAUSADA y dejan de recibir donaciones. |
| RN-05 | Solo se dona a causas ACTIVAS de fundaciones ACTIVAS. |
| RN-06 | Todo donante tiene usuario y una wallet address válida. El anonimato es solo ante el público. |
| RN-07 | El quote tiene vigencia limitada. Si expira antes de autorizar, se pide uno nuevo. |
| RN-08 | Una donación cuenta en el recaudo solo cuando está COMPLETADA, y se libera una sola vez. |
| RN-09 | Lo liberado nunca supera lo recaudado, y lo gastado nunca supera lo liberado. |
| RN-10 | Ningún gasto supera el límite del grant de la fundación en su intervalo. |
| RN-11 | Un gasto tiene como máximo un rechazo. Un gasto rechazado no se reintenta; se crea uno nuevo. |
| RN-12 | Los gastos completados son públicos; los datos personales de beneficiarios nunca se publican. |

---

## 6. Modelo de datos

| Entidad | Descripción |
| --- | --- |
| Usuario | Cuenta de acceso con correo, contraseña y rol. |
| Entidad Gubernamental | Oficina de gobierno que registra y supervisa fundaciones. |
| Fundación | Organización con wallet propia que crea causas y ejecuta gastos. |
| Donante | Perfil de quien dona, con su wallet de origen y país. |
| Causa | Emergencia o campaña de una fundación, con ubicación, fecha y montos. |
| Donación | Aporte de un donante a una causa, con conversión de moneda y liberación. |
| Gasto | Pago a comercio o transferencia que sale de la wallet de la fundación. |
| EvidenciaGasto | Soporte del gasto: factura, foto, comprobante o acta. |
| RechazoGasto | Bloqueo automático o rechazo manual de un gasto, con su motivo. |

### Relaciones

| Relación | Cardinalidad |
| --- | --- |
| Usuario → Entidad Gubernamental | 1 : 1 |
| Usuario (ADMIN) → Entidad Gubernamental (registra) | 1 : N |
| Usuario → Fundación | 1 : 1 |
| Usuario → Donante | 1 : 1 |
| Entidad Gubernamental → Fundación | 1 : N |
| Fundación → Causa | 1 : N |
| Causa → Donación | 1 : N |
| Donante → Donación | 1 : N |
| Causa → Gasto | 1 : N |
| Gasto → EvidenciaGasto | 1 : N |
| Gasto → RechazoGasto | 1 : 0..1 |
| Usuario → EvidenciaGasto (verifica) | 1 : N |
| Usuario → RechazoGasto (rechazo manual) | 1 : N |

El esquema completo está en `alivio_schema.sql` y los datos de prueba en `alivio_seed.sql`.

---

## 7. Requisitos no funcionales

### 7.1 Integridad de datos

| ID | Requisito |
| --- | --- |
| RNF-INT-01 | Toda relación entre entidades se garantiza con llaves foráneas en la base de datos; no existen registros huérfanos. |
| RNF-INT-02 | Los montos se guardan como enteros (`BIGINT`) junto con `asset_code` y `asset_scale`, igual que Open Payments. Nunca se usan decimales de punto flotante para dinero. |
| RNF-INT-03 | Los valores únicos (correo, NIT, wallet de fundación, token de trazabilidad) se protegen con restricciones `UNIQUE`. |
| RNF-INT-04 | Los estados y categorías se restringen a valores permitidos mediante tipos `ENUM`. |
| RNF-INT-05 | Las reglas de montos (montos mayores que cero; liberado ≤ recaudado; gastado ≤ liberado) se validan con restricciones `CHECK` en la base de datos, además de en el backend. |
| RNF-INT-06 | Cada evidencia guarda el hash SHA-256 del archivo para detectar alteraciones. |
| RNF-INT-07 | Los registros financieros (donaciones, gastos, rechazos) no se eliminan ni se editan después de completados; las correcciones se hacen con un registro nuevo. |
| RNF-INT-08 | Cada donación y cada gasto guardan las URL de sus recursos de Open Payments (incoming payment, quote, outgoing payment) para conciliar contra la red. |

### 7.2 Seguridad

| ID | Requisito |
| --- | --- |
| RNF-SEG-01 | Las contraseñas se guardan con un hash lento y con sal (bcrypt o Argon2), nunca en texto plano. |
| RNF-SEG-02 | La autenticación usa tokens de sesión con expiración; cada endpoint verifica el rol antes de actuar (control de acceso por rol). |
| RNF-SEG-03 | Cada actor solo accede a sus propios datos: una entidad solo ve sus fundaciones, una fundación solo sus causas y gastos, un donante solo sus donaciones. |
| RNF-SEG-04 | La llave privada de la aplicación y los tokens de grant se guardan cifrados o en un gestor de secretos, nunca en el repositorio ni en el frontend. |
| RNF-SEG-05 | Las solicitudes a Open Payments se firman con HTTP Message Signatures, y los tokens de acceso se rotan antes de expirar. |
| RNF-SEG-06 | Toda comunicación usa HTTPS (TLS 1.2 o superior). |
| RNF-SEG-07 | Las consultas a la base de datos usan parámetros preparados o un ORM para prevenir inyección SQL; las entradas se validan en el backend. |
| RNF-SEG-08 | Las vistas públicas de trazabilidad nunca exponen datos personales de beneficiarios ni datos de contacto de donantes anónimos. |
| RNF-SEG-09 | Las acciones sensibles (activar o suspender fundación, liberar fondos, rechazar gasto) quedan registradas con usuario, fecha y hora. |
| RNF-SEG-10 | Los endpoints de inicio de sesión y donación tienen límite de solicitudes para evitar abuso. |

### 7.3 Consistencia de datos

| ID | Requisito |
| --- | --- |
| RNF-CON-01 | Toda operación que cambia varios registros (completar una donación y sumar al recaudo, ejecutar un gasto y sumar a lo gastado) ocurre en una sola transacción: se aplica completa o no se aplica. |
| RNF-CON-02 | El estado en la base de datos solo pasa a COMPLETADA o COMPLETADO cuando Open Payments confirma el pago; nunca antes. |
| RNF-CON-03 | Las operaciones con Open Payments son idempotentes: un reintento no crea un segundo pago ni libera dos veces la misma donación. |
| RNF-CON-04 | Para evitar gastar dos veces el mismo saldo, el saldo de la causa se bloquea durante la creación de un gasto (bloqueo de fila o control de concurrencia optimista). |
| RNF-CON-05 | Los totales de la causa (recaudado, liberado, gastado) deben coincidir con la suma de sus donaciones y gastos; un proceso de conciliación lo verifica periódicamente. |
| RNF-CON-06 | Un proceso periódico revisa los pagos pendientes en Open Payments y actualiza su estado si quedó sin confirmar por una falla. |
| RNF-CON-07 | Todas las fechas se guardan en UTC (`TIMESTAMPTZ`) y se muestran en la zona horaria del usuario. |
| RNF-CON-08 | Los estados siguen transiciones válidas (por ejemplo, una causa CERRADA no vuelve a ACTIVA); el backend rechaza transiciones no permitidas. |

---

## 8. Integración con Open Payments

1. **Donación (donante → aplicación):** se crea un incoming payment en la wallet de la aplicación, un quote en la wallet del donante y un grant interactivo de pago saliente. El donante aprueba en su billetera y se ejecuta el outgoing payment.
2. **Liberación (aplicación → fundación):** cuando la donación se completa, la aplicación crea un incoming payment en la wallet de la fundación y paga desde su propia wallet.
3. **Gasto (fundación → comercio o persona):** se crea un incoming payment en la wallet del receptor, un quote en la wallet de la fundación y un outgoing payment con el grant que la fundación otorgó, con límite e intervalo.
4. **Bloqueo:** si el pago supera el límite del grant o el saldo liberado, se rechaza y se registra en RechazoGasto con la respuesta de la API.

| Recurso de Open Payments | Uso |
| --- | --- |
| Wallet address | Identifica a donante, aplicación, fundación y receptor |
| Incoming payment | Cobro en la wallet que recibe, con metadata de causa y gasto |
| Quote | Conversión de moneda y monto exacto a debitar |
| Outgoing payment | Ejecución del pago |
| Grant (GNAP) | Consentimiento del donante y permiso de la fundación con límite |

---

## 9. Supuestos y restricciones

- Se usa la Interledger Test Wallet con dinero de prueba; no hay dinero real en el MVP.
- La aplicación tiene una wallet propia que recibe las donaciones y las libera a las fundaciones. En producción esto puede considerarse custodia de fondos y requeriría revisión regulatoria.
- La verificación de identidad de donantes y fundaciones la hacen sus billeteras.
- Base de datos PostgreSQL 13 o superior.
- El MVP se entrega dentro del plazo de la hackathon; los requisitos no funcionales se cumplen en el diseño y se priorizan por riesgo.