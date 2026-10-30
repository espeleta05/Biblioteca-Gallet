-- Consultas de lectura usadas por el prototipo SIGEB.
-- La API las ejecuta mediante parámetros y no concatena valores recibidos.

-- Usuarios con su perfil y rol.
SELECT
    c.id_credencial,
    c.matricula_nomina AS identificador,
    c.estatus,
    r.nombre_rol,
    COALESCE(a.nombre_completo, p.nombre_completo, b.nombre_completo) AS nombre,
    COALESCE(a.correo_institucional, p.correo_institucional, '') AS correo
FROM CREDENCIALES c
JOIN ROLES r ON r.id_rol = c.id_rol
LEFT JOIN ALUMNOS a ON a.id_credencial = c.id_credencial
LEFT JOIN PROFESORES p ON p.id_credencial = c.id_credencial
LEFT JOIN PERSONAL_BIBLIOTECA b ON b.id_credencial = c.id_credencial
ORDER BY c.id_credencial;

-- Catálogo con autores, tema, ejemplares y disponibilidad.
SELECT
    l.id_libro,
    l.titulo,
    l.isbn,
    COALESCE(string_agg(DISTINCT au.nombre_autor, ', '), 'Autor no registrado') AS autor,
    COALESCE(t.nombre_tema, 'Sin tema') AS tema,
    COUNT(e.id_ejemplar)::int AS ejemplares,
    COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Disponible')::int AS disponibles,
    COALESCE(MAX(e.piso || ' · ' || e.pasillo || '-' || e.estante), 'Sin ubicación') AS ubicacion
FROM LIBROS l
LEFT JOIN LIBRO_AUTOR la ON la.id_libro = l.id_libro
LEFT JOIN AUTORES au ON au.id_autor = la.id_autor
LEFT JOIN TEMAS t ON t.id_tema = l.id_tema
LEFT JOIN EJEMPLARES e ON e.id_libro = l.id_libro
GROUP BY l.id_libro, l.titulo, l.isbn, t.nombre_tema
ORDER BY l.titulo;

-- Métricas del panel principal.
SELECT
    COUNT(*)::int AS total_ejemplares,
    COUNT(*) FILTER (WHERE estado = 'Disponible')::int AS ejemplares_disponibles,
    COUNT(*) FILTER (WHERE estado = 'Prestado')::int AS ejemplares_prestados
FROM EJEMPLARES;

-- Búsqueda parametrizada de libros.
-- En la API el parámetro es $1 y se envuelve con %.
SELECT l.id_libro, l.titulo, l.isbn
FROM LIBROS l
WHERE l.titulo ILIKE '%' || $1 || '%'
   OR l.isbn ILIKE '%' || $1 || '%'
ORDER BY l.titulo;
