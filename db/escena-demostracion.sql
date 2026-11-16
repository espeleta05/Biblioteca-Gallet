-- SIGEB · Escena para la demostración de funciones (solo ambiente de pruebas).
-- Se carga DESPUÉS de esquema, datos-base y datos-prueba. Las fechas son relativas a
-- hoy, así que la escena sirve cualquier día. Comando: ver docs/guion-exposicion.md.
--
-- Qué deja listo:
--   ALU011  préstamo activo normal (vence en días hábiles)        → renovar
--   ALU010  préstamo con 1 renovación ya hecha                     → la 2.ª pasa, la 3.ª se rechaza
--   ALU005  préstamo VENCIDO hace 3 días                           → "Préstamos vencidos" y multa de $30 al devolver
--   ALU006  multa pendiente de $50 por retraso                     → no puede pedir libros; pago con TES-000123
--   ALU007  tiene el único ejemplar de "Ingeniería de software en Google"; ALU008 está en lista de espera
--   ALU009  suspendido por mal uso                                 → no puede pedir libros
--   PROF001 préstamo activo de profesor (10 días hábiles)
--   Una solicitud de compra pendiente para que el administrador la apruebe.

CREATE TEMP TABLE escena_id AS
SELECT matricula_nomina AS clave, id_credencial AS id FROM CREDENCIALES;

-- Préstamos activos (cada ejemplar queda como Prestado).
INSERT INTO PRESTAMOS (id_ejemplar, id_credencial, id_credencial_registra, fecha_prestamo, fecha_vencimiento)
SELECT e.id_ejemplar, (SELECT id FROM escena_id WHERE clave = x.alumno), 2, CURRENT_DATE - x.hace, CURRENT_DATE + x.vence
FROM (VALUES
  ('EFJ-001', 'ALU011', 1, 4),
  ('CLC-001', 'ALU010', 6, 2),
  ('EFJ-002', 'ALU005', 10, -3),
  ('ISG-001', 'ALU007', 2, 3),
  ('CLC-002', 'PROF001', 1, 9)
) AS x(clave, alumno, hace, vence)
JOIN EJEMPLARES e ON e.clave_ejemplar = x.clave;
UPDATE EJEMPLARES SET estado = 'Prestado' WHERE clave_ejemplar IN ('EFJ-001', 'CLC-001', 'EFJ-002', 'ISG-001', 'CLC-002');

-- ALU010 ya renovó una vez.
INSERT INTO RENOVACIONES (id_prestamo, id_credencial_autoriza, fecha_vencimiento_anterior, fecha_vencimiento_nueva)
SELECT p.id_prestamo, 2, p.fecha_vencimiento - 5, p.fecha_vencimiento
FROM PRESTAMOS p WHERE p.id_credencial = (SELECT id FROM escena_id WHERE clave = 'ALU010');

-- ALU006: préstamo ya devuelto con 5 días de retraso y su multa pendiente.
WITH devuelto AS (
  INSERT INTO PRESTAMOS (id_ejemplar, id_credencial, id_credencial_registra, fecha_prestamo, fecha_vencimiento, fecha_devolucion, condicion_devolucion, estado)
  SELECT e.id_ejemplar, (SELECT id FROM escena_id WHERE clave = 'ALU006'), 2, CURRENT_DATE - 15, CURRENT_DATE - 8, CURRENT_DATE - 3, 'Buen estado', 'Devuelto'
  FROM EJEMPLARES e WHERE e.clave_ejemplar = 'DQM-001'
  RETURNING id_prestamo, id_credencial
)
INSERT INTO MULTAS (id_prestamo, id_credencial, motivo, monto_mxn, dias_retraso, fecha_generacion)
SELECT id_prestamo, id_credencial, 'Retraso', 50, 5, CURRENT_DATE - 3 FROM devuelto;

-- ALU008 espera el único ejemplar de "Ingeniería de software en Google".
INSERT INTO LISTA_ESPERA (id_libro, id_credencial, fecha_solicitud)
VALUES (5, (SELECT id FROM escena_id WHERE clave = 'ALU008'), CURRENT_DATE - 1);

-- ALU009 suspendido por mal uso (registro manual del personal).
INSERT INTO SUSPENSIONES (id_credencial, causa, detalle, origen, fecha_inicio, aviso_servicios_escolares)
VALUES ((SELECT id FROM escena_id WHERE clave = 'ALU009'), 'Mal uso', 'Devolvió el libro con páginas arrancadas y rayado', 'Manual', CURRENT_DATE - 2, TRUE);

-- Solicitud de compra pendiente de aprobación.
INSERT INTO SOLICITUDES_COMPRA (id_credencial, titulo, autor, cantidad, justificacion)
VALUES (2, 'Refactoring', 'Martin Fowler', 3, 'Alta demanda en la materia de Ingeniería de Software');

-- Recibos de los préstamos de la escena (evidencia y para mostrar la impresión).
INSERT INTO RECIBOS (folio, tipo, id_referencia, id_credencial, contenido)
SELECT 'P-' || LPAD(p.id_prestamo::text, 6, '0'), 'Préstamo', p.id_prestamo, p.id_credencial,
       'SIGEB · Biblioteca Universidad Ducky' || chr(10) || 'Recibo de préstamo P-' || LPAD(p.id_prestamo::text, 6, '0') || chr(10) ||
       'Libro: ' || l.titulo || chr(10) || 'Fecha de vencimiento: ' || p.fecha_vencimiento
FROM PRESTAMOS p JOIN EJEMPLARES e ON e.id_ejemplar = p.id_ejemplar JOIN LIBROS l ON l.id_libro = e.id_libro;

INSERT INTO BITACORA (servicio, accion, detalle) VALUES ('demostracion', 'Escena cargada', 'Datos para la exposición de funciones');
