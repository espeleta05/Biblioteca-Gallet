-- Datos iniciales de SIGEB para desarrollo y demostración.
-- Ejecutar después de baseDeDatos.sql.
-- Compatible con PostgreSQL 14+.
-- ON CONFLICT DO NOTHING permite ejecutar este archivo más de una vez.

INSERT INTO ROLES
    (id_rol, nombre_rol, dias_prestamo, max_ejemplares, max_renovaciones)
VALUES
    (1, 'Administrador', 30, 20, 5),
    (2, 'Bibliotecario', 15, 10, 3),
    (3, 'Alumno', 7, 3, 1),
    (4, 'Profesor', 15, 8, 3)
ON CONFLICT DO NOTHING;

INSERT INTO PERMISOS
    (id_permiso, nombre_permiso, descripcion)
VALUES
    (1, 'usuarios.consultar', 'Consultar usuarios registrados'),
    (2, 'usuarios.gestionar', 'Crear y actualizar usuarios'),
    (3, 'libros.consultar', 'Consultar el catálogo'),
    (4, 'libros.gestionar', 'Crear y actualizar libros'),
    (5, 'ejemplares.gestionar', 'Gestionar ejemplares físicos')
ON CONFLICT DO NOTHING;

INSERT INTO ROLES_PERMISOS (id_rol, id_permiso)
VALUES
    (1, 1), (1, 2), (1, 3), (1, 4), (1, 5),
    (2, 1), (2, 2), (2, 3), (2, 4), (2, 5),
    (3, 3),
    (4, 3)
ON CONFLICT DO NOTHING;

-- Hashes de demostración. En producción deben reemplazarse por hashes
-- generados por el backend con bcrypt/Argon2; nunca guardar contraseñas planas.
INSERT INTO CREDENCIALES
    (id_credencial, id_rol, matricula_nomina, contrasena_hash, estatus)
VALUES
    (1, 1, 'ADM-0001', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Activa'),
    (2, 2, 'B-0041', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Activa'),
    (3, 3, 'A01724531', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Activa'),
    (4, 3, 'A01983012', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Activa'),
    (5, 4, 'P01482', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Activa')
ON CONFLICT DO NOTHING;

INSERT INTO PERSONAL_BIBLIOTECA
    (id_personal, id_credencial, nomina, nombre_completo, puesto)
VALUES
    (1, 2, 'B-0041', 'Mariana Torres', 'Bibliotecaria')
ON CONFLICT DO NOTHING;

INSERT INTO ALUMNOS
    (matricula, id_credencial, nombre_completo, correo_institucional, telefono)
VALUES
    ('A01724531', 3, 'Ana Sofía Martínez', 'ana.martinez@universidad.edu', '8181001001'),
    ('A01983012', 4, 'Luis Hernández', 'luis.hernandez@universidad.edu', '8181001002')
ON CONFLICT DO NOTHING;

INSERT INTO PROFESORES
    (nomina, id_credencial, nombre_completo, correo_institucional, telefono)
VALUES
    ('P01482', 5, 'Dr. Carlos Ramírez', 'carlos.ramirez@universidad.edu', '8181001003')
ON CONFLICT DO NOTHING;

INSERT INTO EDITORIALES (id_editorial, nombre_editorial)
VALUES
    (1, 'Addison-Wesley'),
    (2, 'Prentice Hall'),
    (3, 'MIT Press'),
    (4, 'Editorial Austral')
ON CONFLICT DO NOTHING;

INSERT INTO TEMAS (id_tema, nombre_tema)
VALUES
    (1, 'Programación'),
    (2, 'Ingeniería de software'),
    (3, 'Ciencias computacionales'),
    (4, 'Literatura')
ON CONFLICT DO NOTHING;

INSERT INTO AUTORES (id_autor, nombre_autor)
VALUES
    (1, 'Joshua Bloch'),
    (2, 'Robert C. Martin'),
    (3, 'Thomas H. Cormen'),
    (4, 'Miguel de Cervantes')
ON CONFLICT DO NOTHING;

INSERT INTO LIBROS
    (id_libro, isbn, titulo, id_editorial, id_tema, edicion, paginas, tipo_uso, precio_ultima_compra_usd)
VALUES
    ('9780134685991', '9780134685991', 'Effective Java', 1, 1, 3, 416, 'General', 49.99),
    ('9780132350884', '9780132350884', 'Clean Code', 2, 2, 1, 464, 'General', 42.00),
    ('9780262046305', '9780262046305', 'Introduction to Algorithms', 3, 3, 4, 1312, 'Reserva', 89.99),
    ('9788498386264', '9788498386264', 'Don Quijote de la Mancha', 4, 4, 1, 1056, 'General', 24.50)
ON CONFLICT DO NOTHING;

INSERT INTO LIBRO_AUTOR (id_libro, id_autor)
VALUES
    ('9780134685991', 1),
    ('9780132350884', 2),
    ('9780262046305', 3),
    ('9788498386264', 4)
ON CONFLICT DO NOTHING;

INSERT INTO EJEMPLARES
    (id_ejemplar, id_libro, clave_ejemplar, estado, piso, area, pasillo, estante)
VALUES
    (1, '9780134685991', 'EFJ-001', 'Disponible', 'Piso 2', 'Tecnología', 'A', '14'),
    (2, '9780134685991', 'EFJ-002', 'Disponible', 'Piso 2', 'Tecnología', 'A', '14'),
    (3, '9780134685991', 'EFJ-003', 'Prestado', 'Piso 2', 'Tecnología', 'A', '14'),
    (4, '9780134685991', 'EFJ-004', 'Disponible', 'Piso 2', 'Tecnología', 'A', '14'),
    (5, '9780134685991', 'EFJ-005', 'Disponible', 'Piso 2', 'Tecnología', 'A', '14'),
    (6, '9780132350884', 'CLC-001', 'Disponible', 'Piso 2', 'Tecnología', 'A', '16'),
    (7, '9780132350884', 'CLC-002', 'Prestado', 'Piso 2', 'Tecnología', 'A', '16'),
    (8, '9780132350884', 'CLC-003', 'Prestado', 'Piso 2', 'Tecnología', 'A', '16'),
    (9, '9780132350884', 'CLC-004', 'Disponible', 'Piso 2', 'Tecnología', 'A', '16'),
    (10, '9780262046305', 'IAL-001', 'Disponible', 'Piso 1', 'Computación', 'C', '03'),
    (11, '9780262046305', 'IAL-002', 'Disponible', 'Piso 1', 'Computación', 'C', '03'),
    (12, '9780262046305', 'IAL-003', 'Disponible', 'Piso 1', 'Computación', 'C', '03'),
    (13, '9788498386264', 'DQM-001', 'Disponible', 'Piso 1', 'Literatura', 'L', '08'),
    (14, '9788498386264', 'DQM-002', 'Disponible', 'Piso 1', 'Literatura', 'L', '08'),
    (15, '9788498386264', 'DQM-003', 'Disponible', 'Piso 1', 'Literatura', 'L', '08')
ON CONFLICT DO NOTHING;

INSERT INTO CHATBOT_REGLAS
    (id_regla, tema, pregunta_frecuente, respuesta_bot)
VALUES
    (1, 'Préstamos', '¿Cuántos libros puedo llevar?', 'El límite depende de tu rol. Consulta tu perfil para conocer el número de ejemplares permitido.'),
    (2, 'Horarios', '¿Cuál es el horario de la biblioteca?', 'La biblioteca abre de lunes a viernes de 08:00 a 20:00 horas.')
ON CONFLICT DO NOTHING;

-- Alinear las secuencias después de insertar identificadores de demostración.
SELECT setval(pg_get_serial_sequence('roles', 'id_rol'), COALESCE(MAX(id_rol), 1), true) FROM ROLES;
SELECT setval(pg_get_serial_sequence('permisos', 'id_permiso'), COALESCE(MAX(id_permiso), 1), true) FROM PERMISOS;
SELECT setval(pg_get_serial_sequence('credenciales', 'id_credencial'), COALESCE(MAX(id_credencial), 1), true) FROM CREDENCIALES;
SELECT setval(pg_get_serial_sequence('personal_biblioteca', 'id_personal'), COALESCE(MAX(id_personal), 1), true) FROM PERSONAL_BIBLIOTECA;
SELECT setval(pg_get_serial_sequence('editoriales', 'id_editorial'), COALESCE(MAX(id_editorial), 1), true) FROM EDITORIALES;
SELECT setval(pg_get_serial_sequence('temas', 'id_tema'), COALESCE(MAX(id_tema), 1), true) FROM TEMAS;
SELECT setval(pg_get_serial_sequence('autores', 'id_autor'), COALESCE(MAX(id_autor), 1), true) FROM AUTORES;
SELECT setval(pg_get_serial_sequence('ejemplares', 'id_ejemplar'), COALESCE(MAX(id_ejemplar), 1), true) FROM EJEMPLARES;
SELECT setval(pg_get_serial_sequence('chatbot_reglas', 'id_regla'), COALESCE(MAX(id_regla), 1), true) FROM CHATBOT_REGLAS;
