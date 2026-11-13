# ADR 0001 · Arquitectura de microservicios con API Gateway

- **Estado:** aceptada
- **Fecha:** 2026-11-13
- **Fuente del requisito:** Propuesta SIGEB 3.1 y 3.2

## Contexto

La propuesta define una arquitectura de cuatro niveles:

1. Clientes: web y app móvil.
2. API Gateway NGINX, que valida identidad y rol.
3. Microservicios NestJS, uno por función del Product Backlog, para que un cambio en multas no rompa préstamos.
4. La base de datos PostgreSQL propia más los sistemas externos.

El prototipo anterior era una sola aplicación Next.js con rutas `/api` y no cumplía esa estructura.

Requisitos arquitectónicamente significativos (ASR, SWEBOK 02):
- Seguridad: JWT y roles.
- Respuesta de 3 segundos o menos.
- Independencia entre funciones.
- Integración con Tesorería y Servicios Escolares por API REST.
- Despliegue con Docker.

## Decisión

- **8 microservicios NestJS**, uno por función del backlog: `usuarios`, `gestionar-libros`, `buscar-libros`, `prestar-libros`, `devolver-libros`, `gestion-multas`, `alumnos-suspendidos` y `chatbot`. Cada uno tiene su propio proceso, puerto y contenedor.
- **Librería común** (`servicios/comun`) con:
  - las reglas de negocio como funciones puras (`dominio/`);
  - el acceso a datos y las transacciones;
  - el JWT y la matriz de permisos;
  - los adaptadores de integración.
- **Una sola base de datos PostgreSQL** compartida. Es la "caja verde" única de la sección 3.1, que describe una base de datos propia de SIGEB, no una por servicio. Cada servicio escribe solo las tablas de su función, salvo las multas que genera la devolución, que el backlog asigna a "Devolver libros".
- **Comunicación entre servicios por REST** con un token de servicio de 1 hora. Por ejemplo, Devolver llama a Lista de espera y a Alumnos suspendidos. Si una llamada falla, la devolución no se deshace: la respuesta lo informa en `seguimiento`.
- **API Gateway NGINX con `auth_request`**. Cada petición se valida contra `usuarios /api/auth/verificar` antes de enrutarla. Además, cada servicio vuelve a validar el JWT (defensa en profundidad).
- **Web en React + TypeScript** usando Next.js solo como interfaz, sin backend.
- **App móvil en React Native (Expo)** con búsqueda y chatbot.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| Mantener el monolito Next.js | No cumple las secciones 3.1 y 3.2 de la propuesta, que el Product Owner pidió seguir al pie de la letra. |
| Una base de datos por microservicio | La propuesta define una sola base propia. Además complica las transacciones de préstamo y devolución, que actualizan libro y usuario a la vez (RNF "registro en tiempo real"). |
| Gateway propio en Node | La propuesta especifica NGINX. |

## Consecuencias

- **Positivas:**
  - Los módulos son independientes y se prueban por separado. Hay 156 pruebas (unitarias y de integración) que corren en CI.
  - Las reglas de negocio están en un solo lugar.
- **Negativas (trade-offs):**
  - Hay más procesos que operar: 8 servicios, el gateway, la base de datos y los respaldos.
  - La base de datos compartida acopla los esquemas; un cambio de tabla exige revisar los servicios que la leen.
- **Deuda registrada:** no hay descubrimiento de servicios. Las URLs internas son fijas en `docker-compose.yml`, lo cual es suficiente para un solo servidor (Propuesta 3.4).
