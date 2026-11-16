# Guion de pruebas de aceptación con usuarios (UAT)

- **Para quién:** el representante de la Biblioteca y uno o dos bibliotecarios (Propuesta 5.3 y Sprint 4).
- **Qué cubre:** cada caso es un criterio de aceptación de una regla o función. Los casos límite son los que pide la propuesta en la sección 4.3.
- **Cómo se registra:** marca **Aceptado** o **Ajuste** en cada caso y firma el acta de aceptación del Sprint (evidencia ISO 9001).
- **Datos de prueba:**

| Cuenta | Contraseña | Uso |
|---|---|---|
| `admin` | `1234` | Administrador de biblioteca |
| `B-0041` | `1234` | Bibliotecaria |
| `ALU001`… | `1234` | Alumnos |
| `PROF001`… | `1234` | Profesores |
| `COL001`… | `1234` | Colaboradores |

| # | Función | Pasos | Resultado esperado | Aceptado |
|---|---|---|---|---|
| 1 | Inicio de sesión | Entrar como B-0041 | Ve Inicio, Prestar y devolver, Multas, Suspendidos, Gestionar libros y Buscar | ☐ |
| 2 | Bloqueo | Escribir mal la contraseña de ALU050 cinco veces | El quinto intento bloquea la cuenta | ☐ |
| 3 | Roles | Entrar como ALU001 | Solo ve Buscar libros y el Asistente | ☐ |
| 4 | Base escolar | Admin → Gestión de usuarios → Verificar con base escolar | Muestra cuántos se consultaron, cuántos son nuevos y cuántos se dieron de baja | ☐ |
| 5 | Ficha | Gestionar libros → Nueva ficha, con un ISBN de dígito verificador incorrecto | Rechaza la ficha y explica el error del ISBN | ☐ |
| 6 | Estado | Abrir la ficha y marcar un ejemplar como Perdido | El filtro "Perdido" lo muestra | ☐ |
| 7 | Búsqueda | Buscar "java" como alumno | Muestra la existencia y el piso, área, pasillo y estante | ☐ |
| 8 | Préstamo (Regla 5) | Prestar a ALU001 un viernes | Vence el viernes siguiente (5 días hábiles) | ☐ |
| 9 | Maestro (Regla 6) | Prestar a PROF001 | Vence en 10 días hábiles | ☐ |
| 10 | **Tercer ejemplar** | Prestar un 3.er libro a ALU001 | Se rechaza: "máximo es 2" | ☐ |
| 11 | Consulta interna | Prestar "Introduction to Algorithms" | Se rechaza: "Consulta interna" | ☐ |
| 12 | **Renovación número tres** | Renovar 3 veces un préstamo de alumno | La 3.ª se rechaza; un profesor sí llega a 3 | ☐ |
| 13 | Recibo | Prestar con recibo por Impresión | Aparece el recibo con folio y se puede imprimir | ☐ |
| 14 | Devolución tardía (Regla 3) | Devolver un préstamo vencido hace 3 días | Multa de $30 | ☐ |
| 15 | Bloqueo por multa (Regla 1) | Prestar a la persona del caso 14 | Se rechaza: "debe 1 multa" | ☐ |
| 16 | Pérdida (Regla 4) | Devolver como Perdido | Cobra el precio en USD por el tipo de cambio y avisa a Tesorería | ☐ |
| 17 | Pago | Multas → Registrar pago con referencia TES-000123 | Se emite el recibo de pago y la multa queda Pagada | ☐ |
| 18 | Revocación | Como admin, revocar una multa con motivo | Queda Revocada con su motivo | ☐ |
| 19 | Adeudos | Multas → Personas con adeudos → Exportar | Se descarga un CSV para Servicios Escolares | ☐ |
| 20 | Robo | Devolver como Robado | Suspensión automática y aviso a Servicios Escolares | ☐ |
| 21 | Lista de espera | Con 0 ejemplares, agregar a lista de espera y luego devolver uno | Se avisa a la primera persona y el libro queda apartado | ☐ |
| 22 | Chatbot | Como alumno: "¿Cuándo vence mi libro?" | Responde con su préstamo real | ☐ |
| 23 | **Fin de semana en el vencimiento** | Prestar a un alumno un lunes | Vence el lunes siguiente, no en sábado | ☐ |
| 24 | Accesibilidad | A+ (aumentar letra), Alto contraste, navegar solo con teclado | Todo sigue siendo legible y operable | ☐ |
| 25 | App móvil | Abrir la app con Expo Go, buscar un libro y preguntar al asistente | Funciona igual que en la web | ☐ |
