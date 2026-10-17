# AGENTS.md

## Objetivo

Mantener una arquitectura Flutter sencilla, organizada, escalable y fácil de mantener, evitando complejidad innecesaria.

## 1. Arquitectura

Utilizar **Feature-First simplificado**, organizando el código por funcionalidades.

Estructura base:

```text
lib/
├── main.dart
├── core/
│   ├── widgets/
│   └── services/
└── features/
    ├── auth/
    │   ├── login_screen.dart
    │   └── auth_service.dart
    ├── home/
    │   ├── home_screen.dart
    │   └── widgets/
    └── payments/
        ├── payments_screen.dart
        └── payments_service.dart
```

## 2. Reglas de organización

- Cada funcionalidad debe tener su propia carpeta dentro de `features/`.
- Las pantallas deben utilizar el sufijo `_screen.dart`.
- Los servicios deben utilizar el sufijo `_service.dart`.
- Los componentes visuales reutilizables deben ubicarse en `widgets/`.
- Los elementos compartidos entre funcionalidades deben ubicarse en `core/`.
- No crear carpetas ni archivos innecesarios.

## 3. Separación de responsabilidades

- **Screens:** responsables de la interfaz y las interacciones del usuario.
- **Widgets:** componentes visuales reutilizables.
- **Services:** responsables de las operaciones de la funcionalidad y la comunicación con APIs.
- **Core:** utilidades, servicios y componentes compartidos.

Las pantallas no deben contener directamente peticiones HTTP ni lógica de negocio compleja.

## 4. Gestión del estado

- Utilizar `setState` para estados locales sencillos.
- Introducir herramientas adicionales de gestión de estado únicamente cuando sean necesarias.
- No agregar dependencias sin una justificación técnica.

## 5. Buenas prácticas

- Aplicar el principio de responsabilidad única.
- Mantener el código legible y fácil de comprender.
- Evitar duplicación innecesaria.
- Utilizar nombres descriptivos.
- Priorizar la reutilización cuando aporte valor.
- Mantener las funcionalidades independientes cuando sea posible.
- Respetar el estilo y las convenciones existentes del proyecto.

## 6. Restricciones para agentes de IA

- No implementar Clean Architecture, MVVM, BLoC u otros patrones complejos sin solicitud explícita.
- No crear capas de repositorios, casos de uso o abstracciones innecesarias.
- No reorganizar funcionalidades existentes sin una razón justificada.
- No agregar paquetes externos cuando Flutter permita resolver el problema fácilmente.
- No modificar archivos ajenos a la funcionalidad solicitada, salvo que sea necesario.
- Antes de crear nuevos componentes, verificar si existe una implementación reutilizable.
- Mantener los cambios pequeños, claros y enfocados.

## 7. Principio fundamental

**La solución más sencilla que cumpla correctamente los requisitos es la solución preferida.**

Priorizar siempre la simplicidad, la mantenibilidad y la claridad sobre la complejidad arquitectónica.