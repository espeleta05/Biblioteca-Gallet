# Decisiones pendientes con el Product Owner

SWEBOK 01 identifica la ambigüedad y la incompletitud como los dos problemas típicos de los requisitos. Este documento lista los puntos de la propuesta que admiten más de una interpretación o que no fijan un valor. Para cada uno se indica qué se implementó y dónde se cambia. Todos los valores se pueden ajustar sin reescribir la lógica (SWEBOK 04: anticipar el cambio).

| # | Punto de la propuesta | Qué se implementó | Dónde se cambia |
|---|---|---|---|
| 1 | Regla 2: "la condición de fecha de vencimiento se confirmará en el Sprint 0" | Solo se renueva si el préstamo **no está vencido**. El mismo día del vencimiento sí se puede renovar. La nueva fecha se cuenta desde el vencimiento actual. | `servicios/comun/dominio/prestamos.ts` → `evaluarRenovacion` |
| 2 | Regla 3: "$10 por cada día de retraso" no dice si son días hábiles | Se cuentan **días naturales** | `servicios/comun/dominio/fechas.ts` → `diasDeRetraso` |
| 3 | "Exceso de multas" (Alumnos suspendidos) no tiene número | Se suspende automáticamente con **3 multas pendientes** | `MULTAS_PARA_SUSPENSION` en `dominio/politicas.ts` |
| 4 | Suspensión por "mal uso" | La registra el personal manualmente. Solo el robo y el exceso de multas suspenden de forma automática. | `dominio/multas.ts` → `motivoSuspensionAutomatica` |
| 5 | Colaboradores: la propuesta no les fija reglas de préstamo | Se les aplican las mismas que a los alumnos: 5 días hábiles, 2 ejemplares, 2 renovaciones | Tabla `ROLES` (`db/datos-base.sql`) |
| 6 | Bloqueo tras 5 intentos fallidos: no se indica cuánto dura | 15 minutos | Variable `MINUTOS_BLOQUEO` |
| 7 | "Solicitud de compra de libros" está en el backlog, pero la 9.3 excluye el proceso de compras | Solo se registra la solicitud y el Administrador la aprueba o la rechaza; no hay presupuesto, pedidos ni facturas | `gestionar-libros` |
| 8 | Lista de espera: no se define quién tiene prioridad | Al devolverse un ejemplar se avisa por correo a la primera persona en espera, y ese ejemplar queda apartado para ella | `prestar-libros/servicio.ts` |
| 9 | Revocación de multas: no dice quién autoriza | Solo el Administrador de biblioteca, con un motivo obligatorio | `gestion-multas` |
| 10 | Contraseña inicial de alumnos sincronizados desde la base escolar | Se toma de `CONTRASENA_INICIAL_ESCOLAR`; en pruebas es `1234` | `.env` |
