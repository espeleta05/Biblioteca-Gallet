-- SIGEB · Datos base, necesarios en todo ambiente (producción y pruebas).
-- Ejecutar después de db/esquema.sql. En pruebas se carga además db/datos-prueba.sql.

-- Reglas 1, 2, 5 y 6. El personal de la biblioteca no es solicitante (0 ejemplares).
-- Colaborador: la propuesta no le fija reglas propias; se aplican las de alumno
-- hasta que el Product Owner indique otra cosa (docs/decisiones-pendientes.md).
INSERT INTO ROLES (id_rol, nombre_rol, dias_prestamo, max_ejemplares, max_renovaciones) VALUES
    (1, 'Administrador', 0, 0, 0),
    (2, 'Bibliotecario', 0, 0, 0),
    (3, 'Alumno',        5, 2, 2),
    (4, 'Profesor',     10, 2, 3),
    (5, 'Colaborador',   5, 2, 2);
-- Los IDs explícitos no avanzan la secuencia de identidad; se alinea a mano.
SELECT setval(pg_get_serial_sequence('roles', 'id_rol'), (SELECT MAX(id_rol) FROM ROLES));

-- Tipo de cambio de respaldo; el servicio lo actualiza a diario desde Banxico.
INSERT INTO TIPO_CAMBIO (fecha, valor_mxn, fuente) VALUES (DATE '2026-11-13', 18.2500, 'Carga inicial');

-- Base de conocimiento del chatbot (Sprint 4). Validar con la Biblioteca.
INSERT INTO CHATBOT_REGLAS (tema, pregunta_frecuente, palabras_clave, respuesta_bot) VALUES
    ('Vigencias', '¿Cuántos días dura un préstamo?', 'cuantos dias dura duran vigencia plazo prestamo vence tiempo quedar quedarme hasta semana semanas habiles',
     'Alumnos y colaboradores: 5 días hábiles. Profesores: 10 días hábiles. Sábados y domingos no cuentan.'),
    ('Renovaciones', '¿Cuántas veces puedo renovar un libro?', 'renovar renovarlo renovacion renovaciones renuevo extender ampliar prorroga veces',
     'Alumnos y colaboradores pueden renovar cada préstamo hasta 2 veces; profesores hasta 3. Un préstamo vencido ya no se renueva.'),
    ('Multas', '¿Cuánto es la multa por entregar tarde?', 'multa multas retraso retrase tarde atraso atrasado cobro cobran pagar costo dia',
     'La multa es de $10 pesos por cada día de retraso. Se paga en Tesorería y la biblioteca registra el pago.'),
    ('Costos de reposición', '¿Cuánto pago si pierdo o daño un libro?', 'perdi perdio perdieron pierdo perdida pierde extravie extraviar daño dañe dañado rompi roto robo robaron reponer reposicion',
     'Se cobra el valor presente del libro: el precio de su última compra en dólares por el tipo de cambio del día publicado por Banxico.'),
    ('Préstamos', '¿Cuántos libros puedo llevar?', 'cuantos libros llevar llevarme maximo limite ejemplares pedir prestar prestan sacar',
     'Puedes tener hasta 2 ejemplares prestados a la vez, siempre que no debas multas ni tengas préstamos vencidos. Los libros de consulta interna o reservados no se prestan.');

-- Perfiles base (HU6-SP0). Cada uno lleva el nombre de su tipo de cuenta y es el
-- que usa una cuenta sin perfil asignado. El administrador puede crear otros.
-- Permisos: ver PERMISOS_SISTEMA en servicios/comun/auth.ts.
INSERT INTO PERFILES (id_perfil, nombre, permisos, es_base) VALUES
    (1, 'Administrador', ARRAY['buscar-libros','gestionar-libros','prestamos','devoluciones','multas','suspensiones','cuentas','perfiles','compras','chatbot'], TRUE),
    (2, 'Bibliotecario', ARRAY['buscar-libros','gestionar-libros','prestamos','devoluciones','multas','suspensiones','chatbot'], TRUE),
    (3, 'Alumno',        ARRAY['buscar-libros','mis-prestamos','chatbot'], TRUE),
    (4, 'Profesor',      ARRAY['buscar-libros','mis-prestamos','chatbot'], TRUE),
    (5, 'Colaborador',   ARRAY['buscar-libros','mis-prestamos','chatbot'], TRUE);
SELECT setval(pg_get_serial_sequence('perfiles', 'id_perfil'), (SELECT MAX(id_perfil) FROM PERFILES));
