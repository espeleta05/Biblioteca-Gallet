# ADR 0002 · Integraciones externas con modo simulado explícito

- **Estado:** aceptada
- **Fecha:** 2026-11-13
- **Fuente:** Propuesta SIGEB 3.5, 7.4 y 9.3

## Contexto

SIGEB se integra con seis sistemas:
- La base de datos escolar.
- Servicios Escolares.
- Tesorería.
- Banxico (API SIE).
- Correo SMTP y WhatsApp Business.
- Dialogflow CX.

Las cuentas y los costos de terceros los provee la Universidad (7.4 y 9.3), y Gallet no modifica los sistemas de Tesorería ni de Servicios Escolares. La propuesta pide que las integraciones se verifiquen con "pruebas de integración en ambiente de pruebas".

## Decisión

- Cada integración tiene un **adaptador real** en `servicios/comun/integraciones.ts` que se activa con variables de entorno (`.env.example`).
- Mientras no haya credenciales, el adaptador **no finge éxito**: el envío queda registrado como `Simulado` en la tabla `AVISOS`, con el motivo. Si el servicio real falla, queda como `Fallido`.
- Para Banxico: si no hay token o no responde, se usa el último tipo de cambio guardado, y la API y la pantalla muestran su fecha y el aviso.
- La **base de datos escolar** y **Tesorería** tienen simuladores (`servicios/simuladores`) con el contrato REST documentado en `docs/api/integraciones.md`. En producción se quitan del `docker-compose` con el perfil `pruebas` y las URLs apuntan a los sistemas reales.
- Si Dialogflow CX no está configurado o no responde, el chatbot usa un **clasificador local** sobre la base de conocimiento validada (`CHATBOT_REGLAS`).

## Alternativas

| Alternativa | Por qué se descartó |
|---|---|
| Solo simulación | No se podría conectar a los servicios reales cuando la Universidad entregue las cuentas. |
| Exigir credenciales para arrancar | Impediría probar y demostrar el sistema en el Sprint Review. |

## Consecuencias

- Todo el sistema se puede demostrar y probar sin cuentas de terceros.
- Lo que no salió del sistema se ve en la bitácora de avisos, así que no se oculta.
- **Pendiente para producción:** cargar los tokens reales y crear en Dialogflow CX las intenciones `consultar.prestamos`, `consultar.vencimientos` y `consultar.multas`.
