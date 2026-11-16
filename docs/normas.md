# Normas del equipo

Google (cap. 8) dice que las normas son leyes que se cumplen sí o sí. SWEBOK 04 pide aplicar estándares. Estas son las de SIGEB.

## Código

1. **Idioma:** los nombres de dominio, los mensajes al usuario y la documentación van en español, con el vocabulario de la biblioteca: préstamo, ejemplar, ficha, multa, adeudo. Los términos técnicos del framework van en inglés: `Controller`, `Module`.
2. **TypeScript estricto** en todos los proyectos (`strict: true`). No se permite `any` ni `@ts-ignore`.
3. **Las reglas de negocio** viven solo en `servicios/comun/dominio` como funciones puras y probadas. Los controladores validan la entrada (DTO) y los servicios orquestan los datos (SWEBOK 03: separar interfaz, lógica y datos).
4. **Nada de números mágicos:** los días, límites y montos de las Reglas 1 a 6 se toman de la tabla `ROLES` o de `dominio/politicas.ts`.
5. **SQL siempre parametrizado.** Las operaciones que tocan varias tablas van en `enTransaccion`.
6. **Errores con el formato `{ error, motivos }`** y en español. Deben explicar qué pasó y qué hacer (Google cap. 10).
7. **Cada operación queda registrada** con `registrarEnBitacora` (ISO 9001).
8. **Accesibilidad:** todo control lleva etiqueta visible o `aria-label`; no se usan colores con contraste menor a 4.5:1; todo funciona con teclado.

## Pruebas

- Cada regla nueva lleva pruebas unitarias con particiones de equivalencia y valores límite (off, on, in, nominal). Las reglas con varias condiciones se prueban con una tabla de decisión (SWEBOK 05).
- Se prueba a través de la API pública y se valida el comportamiento, no los métodos internos (Google cap. 10).
- La proporción objetivo es de unas 80% pruebas unitarias y 20% de integración.

## Cambios y revisión de código (Google cap. 9)

- **Cambios pequeños:** una rama y un PR por cambio lógico, con un mensaje que explique el porqué.
- **Antes de pedir revisión,** revisa tu propio diff y asegúrate de que pasan `npm run typecheck` y `npm test` en `servicios/` y `npm run build` en la raíz.
- **Revisión:** otro integrante revisa con respeto, iteran y da el VoBo; después se integra. Los revisores se limitan a 1 o 2.
- **Lo mecánico lo hace la CI** (`.github/workflows/ci.yml`): tipos, pruebas y build.
