# Matriz de trazabilidad: Product Backlog → código → pruebas

SWEBOK 01 pide mantener trazabilidad. Cada requisito de la Propuesta SIGEB (sección 2.3 y Reglas 2.2) apunta a su implementación y a las pruebas que lo verifican.
- Pruebas unitarias: `servicios/tests/unit`.
- Pruebas de integración: `servicios/tests/integracion`.

## Requisitos funcionales

| Sprint | Requisito | Implementación | Pruebas |
|---|---|---|---|
| 0 | Ver la base de datos de la escuela y verificar usuarios | `usuarios` → `sincronizarConBaseEscolar` | `chatbot-y-sincronizacion.test.ts` → "sincroniza…" |
| 0 | Autenticación usuario/contraseña (JWT, bloqueo tras 5 intentos) | `usuarios` → `iniciarSesion`; `comun/auth.ts` | `usuarios.test.ts` → Autenticación; `permisos.test.ts` → JWT |
| 0 | Roles de acceso | `comun/auth.ts` → `PERMISOS`; `infra/nginx/sigeb.conf` | `permisos.test.ts`; `usuarios.test.ts` → "Acceso por rol…" |
| 1 | Solicitud de compra de libros | `gestionar-libros` → solicitudes | `libros.test.ts` → "Solicitud de compra" |
| 1 | Ficha bibliográfica (con precio USD) | `gestionar-libros` → `crear`/`actualizar`; `dominio/libros.ts` | `unit/libros.test.ts`; `libros.test.ts` → Ficha |
| 1 | Estado del libro (prestado, perdido…) | `gestionar-libros` → `cambiarEjemplar`; `validarCambioEstado` | `libros.test.ts` → "Estado del libro…" |
| 1 | Listado de libros por filtros | `gestionar-libros` → `listar` | `libros.test.ts` → "filtro …" |
| 1 | Consulta de existencia y ubicación (web y app) | `buscar-libros`; `components/vistas/Busqueda.tsx`; `app-movil/App.tsx` | `libros.test.ts` → "Buscar libros" |
| 2 | Validación del solicitante y del libro (Regla 1) | `dominio/prestamos.ts` → `evaluarPrestamo` | `unit/prestamos.test.ts` (tabla de decisión CP1–CP9 y valores límite); `circulacion.test.ts` |
| 2 | Registro de préstamo en días hábiles (Reglas 5 y 6) | `prestar-libros` → `prestar`; `dominio/fechas.ts` | `unit/fechas.test.ts`; `circulacion.test.ts` |
| 2 | Recibo de préstamo (correo, WhatsApp, impresión) | `prestar-libros` → `RECIBOS`; `comun/avisos.ts`; `app/recibos/[folio]` | `circulacion.test.ts` → recibo impreso / correo |
| 2 | Renovación (Reglas 2 y 6) | `evaluarRenovacion`; `prestar-libros` → `renovar` | `unit/prestamos.test.ts`; `circulacion.test.ts` → "tercera se rechaza" |
| 2 | Gestión y registro de lista de espera | `prestar-libros` → lista de espera | `circulacion.test.ts` → "Lista de espera" |
| 2 | Registro de devolución | `devolver-libros` | `circulacion.test.ts` |
| 2 | Multas por entrega tardía, daño o pérdida (Reglas 3 y 4) | `dominio/multas.ts` → `cargosPorDevolucion` | `unit/multas.test.ts` (tabla de decisión); `circulacion.test.ts` |
| 3 | Validar las fechas de los préstamos | `gestion-multas` → `prestamosVencidos` | `circulacion.test.ts` → "validar fechas" |
| 3 | Calcular multa y costo de reposición con tipo de cambio | `multaPorRetraso`, `costoReposicion`; `comun/tipo-cambio.ts` (Banxico) | `unit/multas.test.ts`; `circulacion.test.ts` → "libro perdido" |
| 3 | Avisos de adeudos | `gestion-multas` → `avisarAdeudos` | `circulacion.test.ts` → "lista de personas con adeudos…" |
| 3 | Registrar pagos (Tesorería) y recibo de pago | `gestion-multas` → `pagar` | `circulacion.test.ts` → "pago: Tesorería debe confirmar…" |
| 3 | Revocación de multa | `gestion-multas` → `revocar` | `circulacion.test.ts` → "revocación" |
| 3 | Lista de personas con adeudos | `gestion-multas` → `adeudos`; exportación CSV en `Multas.tsx` | `circulacion.test.ts` |
| 3 | Alumnos suspendidos (exceso de multas, robo, mal uso) y aviso a Servicios Escolares | `alumnos-suspendidos` | `circulacion.test.ts` → robo / exceso; `unit/multas.test.ts` |
| 4 | Chatbot: reglas y políticas | `chatbot`; `dominio/chatbot.ts`; `CHATBOT_REGLAS` | `unit/chatbot.test.ts`; `chatbot-y-sincronizacion.test.ts` |
| 4 | Chatbot: préstamos vigentes, vencimientos y multas | `chatbot` → `respuestaPersonal` | `chatbot-y-sincronizacion.test.ts` |
| 4 | Chatbot en web y app | `components/Chatbot.tsx`; `app-movil/App.tsx` | Verificación manual en navegador (2026-11-13) y en un celular real con Expo Go (2026-11-15) |

## Requerimientos no funcionales (Propuesta 3.3)

| Requerimiento | Cómo se cumple | Cómo se verifica | Estado |
|---|---|---|---|
| Autenticación | JWT HS256, scrypt, bloqueo tras 5 intentos | `usuarios.test.ts` | ✅ |
| Backup/Restore | `infra/respaldos/*.sh`; contenedor `respaldos`; diario con 30 días de retención | Restauración completa probada el 2026-11-13: mismos conteos y checksum | ✅ |
| Respuesta ≤ 3 s | Índices (`db/esquema.sql`); tiempo límite de 2.5 s en integraciones; 5 s en el gateway | k6 con 100 usuarios (`pruebas/carga/k6-busqueda.js`): p95 de 33.8 ms y 0 % de errores | ✅ (falta repetirla a través de NGINX en Docker) |
| Multiplataforma | Web responsiva + React Native | Build de la web; app probada en un celular real con Expo Go (SDK 58) el 2026-11-15: inicio de sesión, búsqueda y asistente | ✅ (falta repetir en el otro sistema operativo, Android o iOS) |
| Accesible | AA en contraste, escala de letra, alto contraste, foco, ARIA, lectores de pantalla | axe en 16 pantallas (`npm run test:accesibilidad`) con 0 violaciones; Lighthouse 100 | ✅ |
| Navegación en 3 clics | Menú por rol y accesos directos | Préstamo: menú → solicitante → libro → registrar | ✅ Verificado en el navegador |
| Chatbot 24 h | Servicio independiente | Batería de preguntas en pruebas | ✅ (falta que la Biblioteca valide las preguntas) |
| Registro en tiempo real | Transacciones y `FOR UPDATE` / `SKIP LOCKED` | `circulacion.test.ts` | ✅ |
| Microservicios con entidades externas | REST documentado (`docs/api/integraciones.md`) | Pruebas con simuladores | ✅ |
