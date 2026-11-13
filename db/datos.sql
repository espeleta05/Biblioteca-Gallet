-- SIGEB · Datos iniciales para el ambiente de pruebas (Propuesta 6.3, Sprint 1:
-- "carga de catálogo de prueba"). Ejecutar después de db/esquema.sql.
-- Contraseña de todas las cuentas de prueba: 1234 (hash scrypt). Cambiarla en producción.

-- Reglas 1, 2, 5 y 6. El personal de la biblioteca no es solicitante (0 ejemplares).
-- Colaborador: la propuesta no le fija reglas propias; se aplican las de alumno
-- hasta que el Product Owner indique otra cosa (docs/decisiones-pendientes.md).
INSERT INTO ROLES (id_rol, nombre_rol, dias_prestamo, max_ejemplares, max_renovaciones) VALUES
    (1, 'Administrador', 0, 0, 0),
    (2, 'Bibliotecario', 0, 0, 0),
    (3, 'Alumno',        5, 2, 2),
    (4, 'Profesor',     10, 2, 3),
    (5, 'Colaborador',   5, 2, 2);

-- Personal de la biblioteca.
INSERT INTO CREDENCIALES (id_credencial, id_rol, matricula_nomina, contrasena_hash) VALUES
    (1, 1, 'admin',  'scrypt$f5357b2890b84b947624777712d51d8a$fc26b82b3ad6dd693089c4c3acd5a1ee109076d9473b498e83d431baa2987c0dba228f2fc4595f5649ad2b9ee29425362a01f540268d4bc8258cb85838088838'),
    (2, 2, 'B-0041', 'scrypt$f5357b2890b84b947624777712d51d8a$fc26b82b3ad6dd693089c4c3acd5a1ee109076d9473b498e83d431baa2987c0dba228f2fc4595f5649ad2b9ee29425362a01f540268d4bc8258cb85838088838');
INSERT INTO PERSONAL_BIBLIOTECA (id_credencial, nombre_completo, correo_institucional, telefono) VALUES
    (1, 'Administrador SIGEB', 'biblioteca@ducky.edu.mx', '8181000000'),
    (2, 'Mariana Torres',      'mariana.torres@ducky.edu.mx', '8181000041');
-- Los IDs explícitos no avanzan la secuencia de identidad; se alinea a mano.
SELECT setval(pg_get_serial_sequence('credenciales', 'id_credencial'), (SELECT MAX(id_credencial) FROM CREDENCIALES));
SELECT setval(pg_get_serial_sequence('roles', 'id_rol'), (SELECT MAX(id_rol) FROM ROLES));

-- Cuentas de alumnos, profesores y colaboradores. Sus datos se verifican contra la
-- base de datos escolar con POST /api/usuarios/sincronizacion (Propuesta 3.5).
INSERT INTO CREDENCIALES (id_rol, matricula_nomina, contrasena_hash)
SELECT 3, 'ALU' || LPAD(i::text, 3, '0'), (SELECT contrasena_hash FROM CREDENCIALES WHERE id_credencial = 1)
FROM generate_series(1, 100) AS i;
INSERT INTO CREDENCIALES (id_rol, matricula_nomina, contrasena_hash)
SELECT 4, 'PROF' || LPAD(i::text, 3, '0'), (SELECT contrasena_hash FROM CREDENCIALES WHERE id_credencial = 1)
FROM generate_series(1, 20) AS i;
INSERT INTO CREDENCIALES (id_rol, matricula_nomina, contrasena_hash)
SELECT 5, 'COL' || LPAD(i::text, 3, '0'), (SELECT contrasena_hash FROM CREDENCIALES WHERE id_credencial = 1)
FROM generate_series(1, 5) AS i;

INSERT INTO USUARIOS_ESCOLARES (id_credencial, tipo, nombre_completo, correo_institucional, telefono)
SELECT c.id_credencial, r.nombre_rol,
       CASE r.nombre_rol WHEN 'Alumno' THEN 'Alumno ' WHEN 'Profesor' THEN 'Profesor ' ELSE 'Colaborador ' END || c.matricula_nomina,
       lower(c.matricula_nomina) || '@ducky.edu.mx',
       '8182' || LPAD(c.id_credencial::text, 6, '0')
FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol
WHERE r.nombre_rol IN ('Alumno', 'Profesor', 'Colaborador');

-- Catálogo de prueba ------------------------------------------------------

INSERT INTO EDITORIALES (id_editorial, nombre_editorial) VALUES
    (1, 'Addison-Wesley'), (2, 'Prentice Hall'), (3, 'MIT Press'), (4, 'Editorial Austral'), (5, 'Marcombo'), (6, 'IEEE Computer Society');
INSERT INTO TEMAS (id_tema, nombre_tema) VALUES
    (1, 'Programación'), (2, 'Ingeniería de software'), (3, 'Ciencias computacionales'), (4, 'Literatura');
INSERT INTO AUTORES (id_autor, nombre_autor) VALUES
    (1, 'Joshua Bloch'), (2, 'Robert C. Martin'), (3, 'Thomas H. Cormen'), (4, 'Miguel de Cervantes'),
    (5, 'Titus Winters'), (6, 'Hironori Washizaki');

INSERT INTO LIBROS (id_libro, isbn, titulo, id_editorial, id_tema, edicion, anio_publicacion, paginas, tipo_uso, precio_ultima_compra_usd) VALUES
    (1, '9780134685991', 'Effective Java', 1, 1, 3, 2018, 416, 'Préstamo externo', 49.99),
    (2, '9780132350884', 'Clean Code', 2, 2, 1, 2008, 464, 'Préstamo externo', 42.00),
    (3, '9780262046305', 'Introduction to Algorithms', 3, 3, 4, 2022, 1312, 'Consulta interna', 89.99),
    (4, '9788498386264', 'Don Quijote de la Mancha', 4, 4, 1, 2015, 1056, 'Préstamo externo', 24.50),
    (5, '9788426734570', 'Ingeniería de software en Google', 5, 2, 1, 2022, 600, 'Préstamo externo', 38.00),
    (6, '9798991389904', 'Guide to the Software Engineering Body of Knowledge (SWEBOK) v4.0', 6, 2, 4, 2025, 400, 'Reservado', 55.00);
INSERT INTO LIBRO_AUTOR (id_libro, id_autor) VALUES (1, 1), (2, 2), (3, 3), (4, 4), (5, 5), (6, 6);
SELECT setval(pg_get_serial_sequence('libros', 'id_libro'), (SELECT MAX(id_libro) FROM LIBROS));
SELECT setval(pg_get_serial_sequence('autores', 'id_autor'), (SELECT MAX(id_autor) FROM AUTORES));
SELECT setval(pg_get_serial_sequence('editoriales', 'id_editorial'), (SELECT MAX(id_editorial) FROM EDITORIALES));
SELECT setval(pg_get_serial_sequence('temas', 'id_tema'), (SELECT MAX(id_tema) FROM TEMAS));

INSERT INTO EJEMPLARES (id_libro, clave_ejemplar, estado, piso, area, pasillo, estante) VALUES
    (1, 'EFJ-001', 'Disponible', 'Piso 2', 'Tecnología', 'A', '14'),
    (1, 'EFJ-002', 'Disponible', 'Piso 2', 'Tecnología', 'A', '14'),
    (1, 'EFJ-003', 'Disponible', 'Piso 2', 'Tecnología', 'A', '14'),
    (2, 'CLC-001', 'Disponible', 'Piso 2', 'Tecnología', 'A', '16'),
    (2, 'CLC-002', 'Disponible', 'Piso 2', 'Tecnología', 'A', '16'),
    (3, 'IAL-001', 'Disponible', 'Piso 1', 'Computación', 'C', '03'),
    (4, 'DQM-001', 'Disponible', 'Piso 1', 'Literatura', 'L', '08'),
    (4, 'DQM-002', 'Disponible', 'Piso 1', 'Literatura', 'L', '08'),
    (5, 'ISG-001', 'Disponible', 'Piso 2', 'Tecnología', 'B', '02'),
    (6, 'SWB-001', 'Disponible', 'Piso 2', 'Tecnología', 'B', '03');

-- Acervo adicional para probar filtros y disponibilidad.
INSERT INTO LIBROS (isbn, titulo, id_editorial, id_tema, edicion, anio_publicacion, paginas, tipo_uso, precio_ultima_compra_usd)
SELECT '978999000' || LPAD(i::text, 4, '0'), 'Libro de demostración ' || LPAD(i::text, 2, '0'),
       1 + (i % 6), 1 + (i % 4), 1, 2010 + (i % 15), 200 + i, 'Préstamo externo', 20 + i
FROM generate_series(1, 20) AS i;
INSERT INTO AUTORES (nombre_autor) SELECT 'Autor de prueba ' || LPAD(i::text, 2, '0') FROM generate_series(1, 20) AS i;
INSERT INTO LIBRO_AUTOR (id_libro, id_autor)
SELECT l.id_libro, a.id_autor FROM LIBROS l
JOIN AUTORES a ON a.nombre_autor = 'Autor de prueba ' || RIGHT(l.titulo, 2)
WHERE l.titulo LIKE 'Libro de demostración %';
INSERT INTO EJEMPLARES (id_libro, clave_ejemplar, piso, area, pasillo, estante)
SELECT l.id_libro, l.isbn || '-001', 'Piso ' || (1 + l.id_libro % 3), 'General', 'D', LPAD((l.id_libro % 20)::text, 2, '0')
FROM LIBROS l WHERE l.titulo LIKE 'Libro de demostración %';

-- Tipo de cambio de respaldo; el servicio lo actualiza a diario desde Banxico.
INSERT INTO TIPO_CAMBIO (fecha, valor_mxn, fuente) VALUES (DATE '2026-11-13', 18.2500, 'Carga inicial');

-- Base de conocimiento del chatbot (Sprint 4). Validar con la Biblioteca.
INSERT INTO CHATBOT_REGLAS (tema, pregunta_frecuente, palabras_clave, respuesta_bot) VALUES
    ('Vigencias', '¿Cuántos días dura un préstamo?', 'cuantos dias dura vigencia plazo prestamo vence tiempo',
     'Alumnos y colaboradores: 5 días hábiles. Profesores: 10 días hábiles. Sábados y domingos no cuentan.'),
    ('Renovaciones', '¿Cuántas veces puedo renovar un libro?', 'renovar renovacion renuevo extender ampliar',
     'Alumnos y colaboradores pueden renovar cada préstamo hasta 2 veces; profesores hasta 3. Un préstamo vencido ya no se renueva.'),
    ('Multas', '¿Cuánto es la multa por entregar tarde?', 'multa retraso tarde atraso cobro pagar costo dia',
     'La multa es de $10 pesos por cada día de retraso. Se paga en Tesorería y la biblioteca registra el pago.'),
    ('Costos de reposición', '¿Cuánto pago si pierdo o daño un libro?', 'perdi pierdo perdida daño dañe robo reponer reposicion',
     'Se cobra el valor presente del libro: el precio de su última compra en dólares por el tipo de cambio del día publicado por Banxico.'),
    ('Préstamos', '¿Cuántos libros puedo llevar?', 'cuantos libros llevar maximo limite ejemplares pedir prestar',
     'Puedes tener hasta 2 ejemplares prestados a la vez, siempre que no debas multas ni tengas préstamos vencidos. Los libros de consulta interna o reservados no se prestan.');
