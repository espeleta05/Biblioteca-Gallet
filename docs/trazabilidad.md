# Matriz de trazabilidad: Product Backlog → código → pruebas

SWEBOK 01 pide mantener trazabilidad. Cada requisito de la Propuesta SIGEB (sección 2.3 y Reglas 2.2) apunta a su implementación y a las pruebas que lo verifican.
- Pruebas unitarias: `servicios/tests/unit`.
- Pruebas de integración: `servicios/tests/integracion`.

## Requisitos funcionales

| Sprint | Requisito | Implementación | Pruebas |
|---|---|---|---|
| 0 | Ver la base de datos de la escuela y verificar usuarios | `usuarios` → `sincronizarConBaseEscolar` | `chatbot-y-sincronizacion.test.ts` → "sincroniza…" |
| 0 | Autenticación usuario/contraseña (JWT, bloqueo tras 3 intentos por 15 minutos, HU1-SP0) | `usuarios` → `iniciarSesion`; `comun/auth.ts` | `usuarios.test.ts` → Autenticación; `permisos.test.ts` → JWT |
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
| 4 | Chatbot: agente con Llama 3.2 en Ollama (preguntas abiertas, información de SIGEB y búsqueda de libros; HU3-SP7) | `comun/dominio/agente.ts`; `chatbot` → `preguntarAlAgente`; `comun/integraciones.ts` → `conversarConOllama`; ADR 0003 | `unit/agente.test.ts` (modelo simulado) |
| 4 | Chatbot en web y app | `components/Chatbot.tsx`; `app-movil/App.tsx` | Verificación manual en navegador (2026-11-13) y en un celular real con Expo Go (2026-11-15) |

## Historias de usuario (Evidencia 06) → código → pruebas

Las 13 historias y sus 57 escenarios se verificaron contra el sistema en marcha el 2026-11-16. El guion de la exposición (`docs/guion-exposicion.md`) dice en qué paso se muestra cada escenario.

| Historia | Implementación | Pruebas |
|---|---|---|
| HU1-SP0 Autenticación (bienvenida, contraseña incorrecta, no registrado o inactivo, bloqueo a los 3 intentos por 15 min, función fuera del perfil) | `usuarios` → `iniciarSesion`; `comun/auth.ts` → `evaluarAcceso`; `X-Mensaje` en `infra/nginx/sigeb.conf`; rutas `#vista` en `Aplicacion.tsx` | `usuarios.test.ts` → "HU1-SP0…"; `permisos.test.ts` → "HU1-SP0 esc. 5" |
| HU2-SP0 Alta de cuentas (cualquier tipo, contraseña temporal por correo, duplicada, campos marcados, solo el administrador) | `usuarios` → `crearCuenta`; `NuevaCuentaDto`; `marcarCampos` en `components/ui.tsx` | `usuarios.test.ts` → "HU2-SP0…"; `permisos.test.ts` → "HU2-SP0 esc. 4" |
| HU3-SP0 Baja de cuentas (motivo, pendientes, inexistente o ya dada de baja, propia; cierra sesiones) | `usuarios` → `darDeBaja`; `verificar` revisa que la cuenta siga activa | `usuarios.test.ts` → "HU3-SP0…" |
| HU4-SP0 Cambio de cuentas (historial, clave duplicada, datos inválidos, el usuario no cambia los suyos) | `usuarios` → `actualizar`, `historial`, `editarMiCuenta`; tabla `HISTORIAL_CAMBIOS` | `usuarios.test.ts` → "HU4-SP0…" |
| HU5-SP0 Consulta de cuentas (clave, nombre, tipo y estatus; bajas con fecha, motivo y quién; sin datos) | `usuarios` → `listar`; `components/vistas/Usuarios.tsx` | `usuarios.test.ts` → "HU3-SP0…", "HU5-SP0 esc. 4" |
| HU6-SP0 Gestión de perfiles (crear, asignar, eliminar; duplicado, sin permisos, en uso) | Tabla `PERFILES`; `usuarios` → `crearPerfil`, `asignarPerfil`, `eliminarPerfil`; permisos en el JWT | `usuarios.test.ts` → "HU6-SP0…"; `permisos.test.ts` → "HU6-SP0…" |
| HU1-SP1 Alta de libros (clave LIB-0000, ejemplares Disponible, duplicado, incompletos, ubicación inexistente) | `gestionar-libros` → `crear`, `validarUbicacion`; tabla `UBICACIONES` | `libros.test.ts` → "HU1-SP1…"; `unit/libros.test.ts` → clave |
| HU2-SP1 Baja de libros (motivo, último ejemplar, prestado o reservado, inexistente o sin motivo) | `gestionar-libros` → `darDeBajaEjemplar`; `validarBajaEjemplar` | `libros.test.ts` → "HU2-SP1…"; `unit/libros.test.ts` → tabla de decisión |
| HU3-SP1 Cambio de libros (historial, cambio de ubicación, datos inválidos, ISBN duplicado) | `gestionar-libros` → `actualizar`, `cambiarUbicacion`, `historial` | `libros.test.ts` → "HU3-SP1…" |
| HU4-SP1 Consulta de libros (por clave o ISBN, estado de cada ejemplar, sin copias con devolución más próxima) | `gestionar-libros` → `consultarPorDato`, `ficha` | `libros.test.ts` → "HU4-SP1…" |
| HU5-SP1 Compra de libros (presupuesto mensual, orden con folio, recepción completa o parcial, aviso al bibliotecario) | `gestionar-libros` → `registrarOrden`, `recibirOrden`; tablas `PRESUPUESTOS`, `ORDENES_COMPRA`, `ORDEN_COMPRA_DETALLE`, `AVISOS_PERSONAL` | `libros.test.ts` → "HU5-SP1…"; `unit/libros.test.ts` → presupuesto y recepción |
| HU6-SP1 Listado por filtro (un renglón por ejemplar, exportar o imprimir, sin resultados, sin filtros) | `gestionar-libros` → `inventario`; `components/vistas/Inventario.tsx` | `libros.test.ts` → "HU6-SP1…" |
| HU1-SP2 Búsqueda con ubicación (criterio y 3 caracteres, varias ubicaciones, sin copias, sin resultados, sin ubicación con aviso) | `buscar-libros` → `buscar`; `components/vistas/Busqueda.tsx`; `app-movil/App.tsx` | `libros.test.ts` → "HU1-SP2…", "HU2-SP1…" |

Accesibilidad de las vistas nuevas: `npm run test:accesibilidad` audita 25 pantallas (entre ellas Gestión de perfiles, Mi cuenta, Listado para inventario y Compra de libros) con 0 violaciones WCAG 2.1 AA.

## Requerimientos no funcionales (Propuesta 3.3)

| Requerimiento | Cómo se cumple | Cómo se verifica | Estado |
|---|---|---|---|
| Autenticación | JWT HS256, scrypt, bloqueo tras 3 intentos (HU1-SP0; configurable con INTENTOS_MAXIMOS) | `usuarios.test.ts` | ✅ |
| Backup/Restore | `infra/respaldos/*.sh`; contenedor `respaldos`; diario con 30 días de retención | Restauración completa probada el 2026-11-13: mismos conteos y checksum | ✅ |
| Respuesta ≤ 3 s | Índices (`db/esquema.sql`); tiempo límite de 2.5 s en integraciones; 5 s en el gateway | k6 con 100 usuarios (`pruebas/carga/k6-busqueda.js`): p95 de 33.8 ms directo a los servicios y 81.5 ms a través de NGINX en Docker, 0 % de errores | ✅ |
| Multiplataforma | Web responsiva + React Native | Build de la web; app probada en un celular real con Expo Go (SDK 58) el 2026-11-15: inicio de sesión, búsqueda y asistente | ✅ (falta repetir en el otro sistema operativo, Android o iOS) |
| Accesible | AA en contraste, escala de letra, alto contraste, foco, ARIA, lectores de pantalla | axe en 16 pantallas (`npm run test:accesibilidad`) con 0 violaciones; Lighthouse 100 | ✅ |
| Navegación en 3 clics | Menú por rol y accesos directos | Préstamo: menú → solicitante → libro → registrar | ✅ Verificado en el navegador |
| Chatbot 24 h | Servicio independiente | Batería de preguntas en pruebas | ✅ (falta que la Biblioteca valide las preguntas) |
| Registro en tiempo real | Transacciones y `FOR UPDATE` / `SKIP LOCKED` | `circulacion.test.ts` | ✅ |
| Microservicios con entidades externas | REST documentado (`docs/api/integraciones.md`) | Pruebas con simuladores | ✅ |
