# Manual de usuario de SIGEB

## Accesibilidad (todas las pantallas)

- Los botones **A−** y **A+** reducen o aumentan el tamaño de la letra. **Alto contraste** cambia los colores. El sistema recuerda tu preferencia en ese equipo.
- Todo se puede usar con el teclado: **Tab** avanza, **Shift+Tab** regresa y **Esc** cierra las ventanas. Al pulsar **Tab** por primera vez aparece "Saltar al contenido".
- La app móvil respeta el tamaño de letra del teléfono y funciona con TalkBack (Android) y VoiceOver (iOS).

## Gestión de usuarios (Administrador)

1. **Verificar con base escolar** actualiza los datos de alumnos, profesores y colaboradores desde Servicios Escolares. Los que ya no están activos en la escuela no pueden entrar.
2. **Alta de personal** da de alta bibliotecarios y administradores. La cuenta funciona de inmediato.
3. **Desactivar/Activar** bloquea o permite el acceso a una cuenta. Los alumnos no se editan en SIGEB porque sus datos vienen de la escuela.

## Gestionar libros (Administrador y Bibliotecario)

- **Nueva ficha:** captura el ISBN (el sistema revisa el dígito verificador), los autores separados por `;`, la editorial, el tema, el **precio de la última compra en dólares** (lo usa el costo de reposición), el tipo de uso, el número de ejemplares y la ubicación.
- **Ficha → Ejemplares:** cambia el estado de cada ejemplar (Disponible, Perdido, Robado o Dañado). El estado "Prestado" lo asigna el sistema al prestar y lo quita al devolver.
- **Filtros:** busca por tema, estado de los ejemplares, tipo de uso o piso. Sirven como lista de inventario.
- **Solicitar compra:** registra el título, la cantidad y la justificación. El Administrador la aprueba o la rechaza.

## Buscar libros (todos)

Escribe un título, autor, ISBN o tema y, si quieres, filtra por tema, piso o "solo disponibles". El resultado muestra cuántos ejemplares hay y dónde están (piso, área, pasillo y estante).

## Prestar y devolver (Administrador y Bibliotecario)

1. Escribe la matrícula o el nombre del **solicitante**. El sistema muestra su situación: préstamos, multas y si está suspendido.
2. Escribe el **libro** y elige cómo entregar el **recibo** (Impresión, Correo o WhatsApp).
3. Pulsa **Registrar préstamo**. Si alguna regla lo impide, el sistema explica todos los motivos.

Además:
- **Renovar:** alumnos y colaboradores pueden renovar 2 veces y profesores 3. No se renueva un préstamo vencido.
- **Devolver:** elige la condición del libro. Antes de confirmar se muestran las multas que se van a generar.
- **Lista de espera:** si no hay ejemplares disponibles aparece "Agregar a lista de espera". Cuando se devuelve un ejemplar, el sistema avisa a la primera persona de la lista.

## Multas y adeudos (Administrador y Bibliotecario)

- **Registrar pago:** captura la referencia del recibo de Tesorería. Tesorería la confirma y el sistema emite el recibo de pago.
- **Revocar** (solo el Administrador) requiere escribir el motivo.
- **Préstamos vencidos** muestra los días de retraso y la multa acumulada hasta hoy.
- **Personas con adeudos** se puede exportar a CSV, imprimir o usar para enviar avisos por correo o WhatsApp.

## Alumnos suspendidos (Administrador y Bibliotecario)

El sistema suspende automáticamente por **robo** o por **exceso de multas** (3 o más pendientes). El **mal uso** se registra a mano, con detalle. Cada suspensión se avisa a Servicios Escolares. **Levantar** solo es posible cuando ya no hay multas pendientes, si esa fue la causa.

## Asistente (chatbot, todos)

Pulsa **Asistente de la biblioteca** y pregunta, por ejemplo:
- "¿Cuántos días dura un préstamo?"
- "¿Tengo multas?"
- "¿Cuándo vence mi libro?"
