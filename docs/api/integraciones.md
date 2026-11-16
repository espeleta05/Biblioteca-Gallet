# Contratos REST de SIGEB

## API pública (a través del gateway, `https://<host>/api`)

**Autenticación:**
- La web usa la cookie httpOnly `sigeb_token`.
- La app móvil usa el encabezado `Authorization: Bearer <JWT>`.

Los errores tienen siempre el formato `{ "error": string, "motivos": string[] }`. Los códigos son: 400 datos inválidos, 401 sin sesión, 403 rol sin acceso, 404 no existe, 409 una regla de negocio lo impide y 423 cuenta bloqueada.

| Función (backlog) | Método y ruta | Roles |
|---|---|---|
| Gestión de usuarios | `POST/GET/DELETE /api/auth/sesion` | Público |
| | `GET /api/usuarios?q&rol` · `POST /api/usuarios` · `PATCH /api/usuarios/:id` · `POST /api/usuarios/sincronizacion` | Administrador |
| Gestionar libros | `GET /api/libros?q&tema&editorial&tipoUso&estado&piso` · `GET /api/libros/catalogos` · `GET/PATCH/DELETE /api/libros/:id` · `POST /api/libros` | Admin, Bibliotecario |
| | `POST /api/libros/:id/ejemplares` · `PATCH /api/libros/:id/ejemplares/:idEjemplar` | Admin, Bibliotecario |
| | `GET/POST /api/solicitudes-compra` · `PATCH /api/solicitudes-compra/:id` (solo el Administrador decide) | Admin, Bibliotecario |
| Buscar libros | `GET /api/busqueda?q&tema&autor&piso&soloDisponibles` · `GET /api/busqueda/filtros` | Todos |
| Prestar libros | `GET /api/prestamos?estado&q` · `GET /api/prestamos/solicitantes?q` · `GET /api/prestamos/libros?q` · `POST /api/prestamos` · `POST /api/prestamos/:id/renovaciones` | Admin, Bibliotecario |
| | `GET /api/recibos/:folio` · `POST /api/recibos/:folio/envios` | Admin, Bibliotecario |
| | `GET/POST /api/lista-espera` · `PATCH /api/lista-espera/:id/cancelacion` · `POST /api/lista-espera/avisos` | Admin, Bibliotecario, servicio |
| Devolver libros | `GET /api/devoluciones/:idPrestamo/vista-previa?condicion` · `POST /api/devoluciones` | Admin, Bibliotecario |
| Gestión de multas | `GET /api/multas?estatus&q` · `GET /api/multas/prestamos-vencidos` · `POST /api/multas/:id/pagos` · `POST /api/multas/:id/revocacion` (Administrador) | Admin, Bibliotecario |
| | `GET /api/adeudos` · `POST /api/adeudos/avisos` · `GET /api/tipo-cambio` | Admin, Bibliotecario |
| Alumnos suspendidos | `GET/POST /api/suspensiones` · `PATCH /api/suspensiones/:id/levantamiento` · `POST /api/suspensiones/evaluaciones` (servicio) | Admin, Bibliotecario |
| Chatbot | `POST /api/chatbot/mensajes` · `GET /api/chatbot/sugerencias` | Todos |

Los cuerpos de cada petición están definidos y validados con los DTO de `servicios/*/src` (class-validator). El detalle de comportamiento está en las pruebas de integración de `servicios/tests/integracion`, que funcionan como especificación ejecutable.

## Base de datos escolar (Servicios Escolares)

| Ruta | Descripción |
|---|---|
| `GET /api/usuarios` | Solo lectura. Devuelve `{ usuarios: [{ identificador, tipo: "Alumno"/"Profesor"/"Colaborador", nombre, correo, telefono, activo }] }` |
| `POST /api/avisos` | Recibe `{ tipo: "Suspensión"/"Libro perdido", identificador, ... }`. Envía la lista de suspendidos y los avisos de libros perdidos. |

## Tesorería

| Ruta | Descripción |
|---|---|
| `POST /api/pagos/confirmaciones` | Recibe `{ referencia, montoMxn, identificador }` y devuelve `{ confirmado: boolean, motivo? }`. Una referencia no se puede aplicar dos veces. |
| `POST /api/avisos` | Recibe `{ tipo: "Libro perdido", identificador, montoMxn, concepto }` |

## Banxico (API SIE)

`GET https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno` con el encabezado `Bmx-Token`. Corresponde al tipo de cambio FIX y se consulta una vez al día; el valor se guarda en `TIPO_CAMBIO`.

## Dialogflow CX

`POST https://{region}-dialogflow.googleapis.com/v3/projects/{proyecto}/locations/{region}/agents/{agente}/sessions/{sesion}:detectIntent`

Intenciones esperadas para las consultas personales: `consultar.prestamos`, `consultar.vencimientos` y `consultar.multas`.
