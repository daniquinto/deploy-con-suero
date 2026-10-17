# deploy-con-suero — mobile

## ¿Qué es Open Finance?

Open Finance es el modelo en el que los sistemas financieros se comunican entre sí mediante
estándares abiertos, en lugar de operar como "islas" incompatibles. Hoy una transferencia
internacional puede tardar de 3 a 5 días y costar entre 20 y 50 USD en comisiones, y más de
1.000 millones de personas siguen fuera del sistema bancario.

La implementación práctica de esa idea son dos piezas de la Fundación Interledger:

- **Interledger (ILP):** protocolo abierto y neutral —no es una criptomoneda ni un banco— que
  conecta ledgers distintos (bancos, billeteras, blockchains). Divide el pago en paquetes de
  valor que viajan por conectores, que enrutan y convierten divisas. La entrega se asegura con
  transferencia de dos fases (secreto + hash): si un salto falla, la operación se revierte.
  El enrutamiento va a velocidad de internet y la liquidación ocurre después, fuera del protocolo.
- **Open Payments:** la API REST estándar sobre ILP. Identifica cuentas con una **wallet address**
  (URL de la cuenta) y un **payment pointer** (alias tipo `$alias`), y autoriza con **GNAP**, de
  modo que la aplicación recibe un token y nunca ve las credenciales del usuario.

El resultado: una sola integración para llegar a bancos, billeteras y dinero móvil, con costos
visibles, micropagos viables y pagos que se sienten tan simples como enviar un correo.

## Estructura del proyecto

El proyecto se divide en tres ramas, una por capa:

| Rama | Responsabilidad |
| --- | --- |
| `frontend` | Interfaz web que el usuario usa para pagar y autorizar. |
| `backend` | Servidor que integra la API de Open Payments y guarda las llaves. |
| `mobile` | App móvil con el mismo flujo, pensada para pagos en el celular. |

## Esta rama: `mobile`

Es la app móvil: el mismo flujo de pago que la web, adaptado al celular.

- Pago a un **payment pointer** escaneando un QR o compartiendo un alias.
- Confirmación del **quote** con biometría (huella o rostro) antes de aprobar.
- Autorización **GNAP** vía deep link, de vuelta a la app al terminar.
- Pensada para micropagos y pagos recurrentes, con notificaciones de estado.

Consume la API del `backend`; no contiene llaves privadas.
