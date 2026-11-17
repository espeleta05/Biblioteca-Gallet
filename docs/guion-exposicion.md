# Guion de la exposición: funciones de SIGEB

Demostración en vivo de las **8 funciones del Product Backlog** (Propuesta 2.3), en el orden de los sprints. Cada función se muestra con una regla de la propuesta funcionando. Duración: unos 12 minutos.

## Antes de empezar (5 minutos antes)

1. Abre **Docker Desktop** y espera a que diga *Engine running*.
2. En PowerShell, desde la carpeta del proyecto:

   ```
   powershell -ExecutionPolicy Bypass -File infra\preparar-demostracion.ps1
   ```

   Deja la base con la escena de demostración. Vuelve a ejecutarlo antes de cada ensayo.
3. Abre **https://localhost**. Ante el aviso del certificado de pruebas: *Configuración avanzada → Continuar*.
4. Ten listas dos ventanas del navegador: una normal para el personal y una de incógnito para el alumno.

**Cuentas** (contraseña `1234`):

| Cuenta | Rol |
|---|---|
| `admin` | Administrador |
| `B-0041` | Bibliotecaria |
| `ALU001` | Alumno |

**Escena precargada:**

| Persona | Situación | Para mostrar |
|---|---|---|
| ALU005 | Préstamo **vencido** hace 3 días | Validar fechas, multa por retraso y bloqueo |
| ALU006 | **Multa pendiente** de $50 | Bloqueo por adeudo y pago con Tesorería |
| ALU007 / ALU008 | ALU007 tiene el único ejemplar de *Ingeniería de software en Google*; ALU008 lo **espera** | Lista de espera |
| ALU009 | **Suspendido** por mal uso | Bloqueo por suspensión |
| ALU010 | Préstamo con **1 renovación** ya hecha | Límite de renovaciones |
| ALU099 | Cuenta **dada de baja** (egresó) | HU1-SP0 esc. 3 y HU5-SP0 esc. 2 |
| *Design Patterns* | Ejemplar **sin ubicación** registrada | HU1-SP2 esc. 5 |
| *Libro de demostración 05* | Su único ejemplar está **reservado** para ALU012 | HU2-SP1 esc. 3 y HU4-SP1 |
| *Clean Architecture* | Solicitud de compra **aprobada** | HU5-SP1 |
| Perfil *Auxiliar de inventario* | Perfil sin cuentas | HU6-SP0 esc. 3 |

Cada paso indica entre corchetes la historia de usuario y el escenario de la Evidencia 06 que demuestra.

---

## Sprint 0 · 1. Gestión de usuarios (cuenta `admin`)

1. Inicia sesión con `admin`: aparece **"Bienvenido(a), Administrador SIGEB."** y el menú según su perfil. [HU1-SP0 esc. 1]
2. En incógnito, entra con `ALU099` → "Usuario no registrado o inactivo…". Escribe mal la contraseña de `ALU050` **3 veces** → "Tu cuenta se bloqueó… intenta de nuevo en 15 minutos". [HU1-SP0 esc. 2, 3 y 4]
3. Como `ALU001`, escribe en la barra de direcciones `https://localhost/#usuarios` → "No tienes permisos para acceder a esta función". Con `B-0041` → "Solo el administrador puede dar de alta cuentas". [HU1-SP0 esc. 5 · HU2-SP0 esc. 4]
4. **Gestión de usuarios → Alta de cuentas:** crea un alumno con contraseña temporal → "Cuenta creada con clave…" (se le envía por correo). Repite la misma clave → "Ya existe una cuenta con la clave…". Pon un correo sin @ → los campos quedan **marcados en rojo**. [HU2-SP0 esc. 1–3]
5. **Baja de cuentas:** `ALU005` → no se puede, y lista su préstamo pendiente. `admin` → "No puedes dar de baja tu propia cuenta". `ALU030` con motivo → "Cuenta dada de baja" (si tenía sesión abierta, se cierra). No uses `ALU001`: se usa después en los préstamos. [HU3-SP0 esc. 1–4]
6. **Consultar cuentas** sin escribir nada → "Captura una clave o nombre…". Estatus **Inactiva** → se ven la fecha, el motivo y quién hizo la baja. [HU5-SP0 esc. 1–4]
7. En una cuenta: **Cambiar datos** (nombre o teléfono) → **Historial** muestra el dato anterior, la fecha y quién. Cambia la matrícula por una existente → "La clave … ya pertenece a otra cuenta". [HU4-SP0 esc. 1–3]
8. Como alumno: **Mi cuenta → Editar mis datos** → "Solo el administrador puede cambiar estos datos…". También muestra sus préstamos y multas. [HU4-SP0 esc. 4]
9. **Gestión de perfiles:** crea "Becario" con *Buscar libros* y *Gestionar libros*; repite el nombre → duplicado; sin permisos → "Selecciona al menos un permiso". **Asignar perfil** a `ALU020` (aplica desde su siguiente inicio de sesión). Elimina "Becario" → no se puede (tiene cuentas); elimina "Auxiliar de inventario" → "Perfil eliminado". [HU6-SP0 esc. 1–5]
10. **Verificar con base escolar.** **Punto a explicar:** los alumnos y profesores también se verifican contra la base de datos escolar.

## Sprint 1 · 2. Gestionar libros (cuenta `B-0041`, compras con `admin`)

1. **Alta de libros** con ubicación *Piso 9* → "La ubicación … no existe en la Biblioteca". Con ISBN `9780134685991` → "El libro ya existe con clave LIB-0001…". Completa uno nuevo → "Libro registrado con clave LIB-00xx". [HU1-SP1 esc. 1–4]
2. **Consulta de libros** con `LIB-0005` → ficha completa; como no hay copias, muestra **la fecha de devolución más próxima**. `LIB-0011` → su ejemplar aparece **Reservado**. Sin dato o con un ISBN que no existe → mensajes. [HU4-SP1 esc. 1–4]
3. **Baja de libros:** el ejemplar reservado de `LIB-0011` → "No se puede dar de baja un ejemplar prestado o reservado". `DQM-002` sin motivo → "Selecciona el motivo"; con *Obsoleto* → "Ejemplar dado de baja". [HU2-SP1 esc. 1, 3 y 4]
4. En la ficha: cambia un dato y abre **Historial de cambios**; **Cambiar la ubicación del libro** → "Ubicación actualizada"; cambia el ISBN por uno existente → "El ISBN ya pertenece al libro con clave…". [HU3-SP1 esc. 1–4]
5. **Listado para inventario:** sin filtros → "Elige al menos un filtro"; Tema *Programación* y Piso *Piso 2* → un renglón por ejemplar con su total; **Exportar CSV** o **Imprimir** → "Listado generado". [HU6-SP1 esc. 1–4]
6. Con `admin`: aprueba "Refactoring" en **Solicitudes de compra**. **Compra de libros:** *Clean Architecture* a $12,000 → "La compra excede el presupuesto del mes por…"; a $850 → "Orden de compra OC-000001 registrada". **Recepción** de 1 de 2 → "Falta 1 libro por recibir…" (Recibida parcialmente) y el bibliotecario ve el pendiente en **Inicio**. [HU5-SP1 esc. 1–5]

## Sprint 2 (HU1-SP2) · 3. Buscar libros (ventana de incógnito, cuenta `ALU001`)

1. Inicia sesión con `ALU001`. **Punto a explicar:** el alumno ve **Buscar libros**, **Mi cuenta** y el **Asistente**.
2. **Buscar por** *Título* "java" → cada ubicación con sus copias disponibles. Con "ja" → pide mínimo 3 caracteres. [esc. 1 y 2]
3. *Editorial* "prentice" → *Clean Code* "Sin copias disponibles" con la **devolución más próxima**. [esc. 3]
4. "zzzz" → "No se encontraron libros con ese criterio" y sugiere otro criterio. [esc. 4]
5. *Título* "design" → *Design Patterns* con "Ubicación no disponible: pregunta en el mostrador"; el bibliotecario ve el aviso en **Inicio**. [esc. 5]
6. *(Opcional)* Muestra lo mismo en la **app móvil** con Expo Go.

## Sprint 2 · 4. Prestar libros (cuenta `B-0041`)

1. Cierra sesión del `admin` y entra con `B-0041` → **Prestar y devolver**.
2. Solicitante `ALU001` y libro *Effective Java*, recibo por **Impresión** → **Registrar préstamo**. **Punto a explicar:** vence en **5 días hábiles** sin contar el fin de semana (Regla 5); se muestra el recibo.
3. Con el mismo alumno, presta *Don Quijote*. Luego intenta un **tercer** libro. **Punto a explicar:** se rechaza por "el máximo es 2" (Regla 1).
4. Solicitante `ALU005` y *Don Quijote* → se rechaza. **Punto a explicar:** tiene un préstamo vencido (Regla 1).
5. Solicitante `ALU009` → se rechaza. **Punto a explicar:** está suspendido.
6. Solicitante `ALU001` y *Introduction to Algorithms* → se rechaza. **Punto a explicar:** es de consulta interna.
7. En **Préstamos activos**, busca `ALU010` → **Renovar** → pasa (2 de 2). **Renovar** otra vez → se rechaza. **Punto a explicar:** máximo 2 renovaciones para alumnos y 3 para profesores (Reglas 2 y 6).
8. Solicitante `ALU002` y libro *Clean Code* (0 disponibles) → **Agregar a lista de espera**.

## Sprint 2 · 5. Devolver libros (cuenta `B-0041`)

1. En **Préstamos activos**, busca `ALU005` → **Devolver**. La vista previa marca **$30**. **Punto a explicar:** $10 por cada uno de los 3 días de retraso (Regla 3). Confirma.
2. Busca `ALU007` → **Devolver** en buen estado. **Punto a explicar:** el sistema avisa a la primera persona en lista de espera (ALU008).
3. Busca `ALU001` → **Devolver** y elige la condición **Perdido**. **Punto a explicar:** costo de reposición = precio en USD × tipo de cambio de Banxico (Regla 4), con aviso a Tesorería y Servicios Escolares.

## Sprint 3 · 6. Gestión de multas (cuenta `B-0041`)

1. **Multas y adeudos** → pestaña **Préstamos vencidos**. **Punto a explicar:** valida las fechas y muestra la multa acumulada al día.
2. Pestaña **Multas:** la de `ALU006` ($50) → **Registrar pago** con la referencia `TES-000123`. **Punto a explicar:** Tesorería confirma la referencia y se emite el recibo de pago.
3. Repite con una referencia inválida como `ABC-1`. **Punto a explicar:** Tesorería la rechaza.
4. Pestaña **Personas con adeudos** → **Exportar lista (CSV)** y **Enviar avisos por correo**. **Punto a explicar:** es la lista para Servicios Escolares.

## Sprint 3 · 7. Alumnos suspendidos (cuenta `B-0041`)

1. **Alumnos suspendidos:** aparece ALU009 con su causa y el aviso a Servicios Escolares.
2. **Registrar suspensión** de otro alumno por *Mal uso*. **Punto a explicar:** el robo y el exceso de multas (3 pendientes) suspenden de forma automática.

## Sprint 4 · 8. Chatbot (las dos ventanas)

1. Como `B-0041`, abre el **Asistente de la biblioteca** y pregunta "¿Cuántos días dura un préstamo?".
2. En incógnito, entra con `ALU005` y pregunta "¿Cuándo vence mi libro?" y luego "¿Tengo multas?". **Punto a explicar:** responde con sus datos reales.
3. **Agente con Llama** (preguntas abiertas). Pregunta "¿Para qué sirve SIGEB?" y "¿En qué plataformas puedo usarlo?" [HU3-SP7]. Luego "¿Hay libros de java disponibles y dónde están?": busca en el catálogo y da la ubicación. Por último "¿Cuál es la capital de Francia?": responde que solo ayuda con la Biblioteca. **Punto a explicar:** las preguntas frecuentes se responden al instante; las abiertas las contesta Llama 3.2, que corre dentro del servidor (Ollama), sin costo y sin que los datos salgan de la Universidad. Tarda unos segundos porque no hay tarjeta gráfica. Si Ollama está apagado, responde el clasificador. (ADR 0003)
   - Antes de la demo, comprueba que el modelo esté cargado con `docker compose exec ollama ollama ps`.

## Cierre (1 minuto)

- **Accesibilidad:** pulsa **A+** varias veces y luego **Alto contraste**. **Punto a explicar:** cumple WCAG 2.1 AA (axe sin errores, Lighthouse 100).
- **Arquitectura:** en PowerShell ejecuta `docker compose ps`. **Punto a explicar:** son 14 contenedores (8 microservicios, NGINX, PostgreSQL, respaldos y simuladores).
- **Calidad:** 210 pruebas automáticas; prueba de carga con 100 usuarios con un p95 de 81.5 ms, cuando la propuesta pide 3 s o menos.

## Si algo falla

| Problema | Solución |
|---|---|
| La página no carga | Revisa que Docker Desktop esté abierto y ejecuta `docker compose --profile pruebas up -d` |
| Los datos quedaron revueltos por un ensayo | Vuelve a correr `infra\preparar-demostracion.ps1` |
| "Cuenta bloqueada" | Espera 15 minutos o usa otra cuenta (`ALU0xx`) |
