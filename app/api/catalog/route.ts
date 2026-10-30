import { NextResponse } from "next/server";
import { getSession, hashPassword } from "../../../lib/auth";
import { pool } from "../../../lib/db";

export const dynamic = "force-dynamic";

type UserPayload = {
  name: string;
  identifier: string;
  email: string;
  role: "Alumno" | "Profesor" | "Bibliotecario";
  password: string;
};

type BookPayload = {
  title: string;
  author: string;
  isbn: string;
  category: string;
  copies: number;
  location: string;
};

function errorResponse(error: unknown) {
  console.error("Error en API de catálogo:", error);
  return NextResponse.json(
    { error: "No fue posible completar la operación con PostgreSQL." },
    { status: 500 },
  );
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  const body = await request.json().catch(() => null) as
    | { resource?: "user" | "book"; id?: string; data?: Partial<UserPayload & BookPayload> }
    | null;
  if (!body?.resource || !body.id || !body.data) {
    return NextResponse.json({ error: "Faltan datos para editar el registro." }, { status: 400 });
  }
  if (body.resource === "user" && session.role !== "Administrador") {
    return NextResponse.json({ error: "Solo el administrador puede gestionar usuarios." }, { status: 403 });
  }
  if (body.resource === "book" && !["Administrador", "Bibliotecario"].includes(session.role)) {
    return NextResponse.json({ error: "No tienes permisos para gestionar libros." }, { status: 403 });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (body.resource === "user") {
      const data = body.data as Partial<UserPayload>;
      const credential = await client.query("SELECT id_rol FROM CREDENCIALES WHERE id_credencial = $1", [body.id]);
      if (!credential.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
      }
      const role = await client.query("SELECT id_rol FROM ROLES WHERE nombre_rol = $1", [data.role]);
      await client.query(
        "UPDATE CREDENCIALES SET matricula_nomina = COALESCE($1, matricula_nomina), id_rol = COALESCE($2, id_rol) WHERE id_credencial = $3",
        [data.identifier, role.rows[0]?.id_rol, body.id],
      );
      if (data.role === "Alumno") {
        await client.query("UPDATE ALUMNOS SET nombre_completo = COALESCE($1, nombre_completo), correo_institucional = COALESCE($2, correo_institucional), matricula = COALESCE($3, matricula) WHERE id_credencial = $4", [data.name, data.email, data.identifier, body.id]);
      } else if (data.role === "Profesor") {
        await client.query("UPDATE PROFESORES SET nombre_completo = COALESCE($1, nombre_completo), correo_institucional = COALESCE($2, correo_institucional), nomina = COALESCE($3, nomina) WHERE id_credencial = $4", [data.name, data.email, data.identifier, body.id]);
      } else {
        await client.query("UPDATE PERSONAL_BIBLIOTECA SET nombre_completo = COALESCE($1, nombre_completo), nomina = COALESCE($2, nomina) WHERE id_credencial = $3", [data.name, data.identifier, body.id]);
      }
    } else {
      const data = body.data as Partial<BookPayload>;
      const book = await client.query("SELECT id_libro, id_tema FROM LIBROS WHERE id_libro = $1", [body.id]);
      if (!book.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Libro no encontrado." }, { status: 404 });
      }
      let topicId = book.rows[0].id_tema;
      if (data.category) {
        const topic = await client.query(
          "INSERT INTO TEMAS (nombre_tema) VALUES ($1) ON CONFLICT (nombre_tema) DO UPDATE SET nombre_tema = EXCLUDED.nombre_tema RETURNING id_tema",
          [data.category],
        );
        topicId = topic.rows[0].id_tema;
      }
      await client.query(
        "UPDATE LIBROS SET titulo = COALESCE($1, titulo), isbn = COALESCE($2, isbn), id_tema = $3 WHERE id_libro = $4",
        [data.title, data.isbn, topicId, body.id],
      );
      if (data.author) {
        await client.query("DELETE FROM LIBRO_AUTOR WHERE id_libro = $1", [body.id]);
        const author = await client.query("INSERT INTO AUTORES (nombre_autor) VALUES ($1) RETURNING id_autor", [data.author]);
        await client.query("INSERT INTO LIBRO_AUTOR (id_libro, id_autor) VALUES ($1, $2)", [body.id, author.rows[0].id_autor]);
      }
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    return errorResponse(error);
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  const body = await request.json().catch(() => null) as { resource?: "user" | "book"; id?: string } | null;
  if (!body?.resource || !body.id) return NextResponse.json({ error: "Faltan datos para eliminar." }, { status: 400 });
  if (body.resource === "user" && session.role !== "Administrador") {
    return NextResponse.json({ error: "Solo el administrador puede gestionar usuarios." }, { status: 403 });
  }
  if (body.resource === "book" && !["Administrador", "Bibliotecario"].includes(session.role)) {
    return NextResponse.json({ error: "No tienes permisos para gestionar libros." }, { status: 403 });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (body.resource === "user") {
      await client.query("DELETE FROM CREDENCIALES WHERE id_credencial = $1", [body.id]);
    } else {
      await client.query("DELETE FROM LIBRO_AUTOR WHERE id_libro = $1", [body.id]);
      await client.query("DELETE FROM EJEMPLARES WHERE id_libro = $1", [body.id]);
      await client.query("DELETE FROM LIBROS WHERE id_libro = $1", [body.id]);
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    return errorResponse(error);
  } finally {
    client.release();
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  try {
    const [users, books, currentUser, inventory, activity] = await Promise.all([
      session.role === "Administrador" ? pool.query(`
        SELECT
          c.id_credencial,
          c.matricula_nomina AS identifier,
          c.estatus,
          r.nombre_rol,
          COALESCE(a.nombre_completo, p.nombre_completo, b.nombre_completo) AS name,
          COALESCE(a.correo_institucional, p.correo_institucional, '') AS email
        FROM CREDENCIALES c
        JOIN ROLES r ON r.id_rol = c.id_rol
        LEFT JOIN ALUMNOS a ON a.id_credencial = c.id_credencial
        LEFT JOIN PROFESORES p ON p.id_credencial = c.id_credencial
        LEFT JOIN PERSONAL_BIBLIOTECA b ON b.id_credencial = c.id_credencial
        ORDER BY c.id_credencial
      `) : Promise.resolve({ rows: [] }),
      pool.query(`
        SELECT
          l.id_libro AS id,
          l.titulo AS title,
          l.isbn,
          COALESCE(string_agg(DISTINCT au.nombre_autor, ', '), 'Autor no registrado') AS author,
          COALESCE(t.nombre_tema, 'Sin tema') AS category,
          COUNT(e.id_ejemplar)::int AS copies,
          COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Disponible')::int AS available,
          COALESCE(MAX(e.piso || ' · ' || e.pasillo || '-' || e.estante), 'Sin ubicación') AS location,
          l.tipo_uso AS type,
          l.edicion,
          l.paginas,
          l.precio_ultima_compra_usd AS price,
          COALESCE(MAX(ed.nombre_editorial), 'Sin editorial') AS publisher,
          l.id_tema AS topic_id
        FROM LIBROS l
        LEFT JOIN LIBRO_AUTOR la ON la.id_libro = l.id_libro
        LEFT JOIN AUTORES au ON au.id_autor = la.id_autor
        LEFT JOIN TEMAS t ON t.id_tema = l.id_tema
        LEFT JOIN EDITORIALES ed ON ed.id_editorial = l.id_editorial
        LEFT JOIN EJEMPLARES e ON e.id_libro = l.id_libro
        GROUP BY l.id_libro, l.titulo, l.isbn, t.nombre_tema, l.tipo_uso, l.edicion, l.paginas, l.precio_ultima_compra_usd, l.id_tema
        ORDER BY l.titulo
      `),
      Promise.resolve({ rows: [{ name: session.name, role: session.role }] }),
      pool.query(`
        SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE estado = 'Disponible')::int AS available,
          COUNT(*) FILTER (WHERE estado = 'Prestado')::int AS borrowed
        FROM EJEMPLARES
      `),
      pool.query(`
        SELECT *
        FROM (
          SELECT 'users' AS icon, 'Nuevo usuario registrado' AS title,
            COALESCE(a.nombre_completo, p.nombre_completo, b.nombre_completo) AS detail,
            c.id_credencial::text AS event_id
          FROM CREDENCIALES c
          LEFT JOIN ALUMNOS a ON a.id_credencial = c.id_credencial
          LEFT JOIN PROFESORES p ON p.id_credencial = c.id_credencial
          LEFT JOIN PERSONAL_BIBLIOTECA b ON b.id_credencial = c.id_credencial
          UNION ALL
          SELECT 'book', 'Libro agregado al catálogo', l.titulo, l.id_libro::text
          FROM LIBROS l
        ) activity
        ORDER BY event_id DESC
        LIMIT 3
      `),
    ]);

    return NextResponse.json({
      users: users.rows.map((user, index) => ({
        id: user.id_credencial,
        name: user.name ?? "Usuario sin perfil",
        identifier: user.identifier,
        email: user.email,
        role: user.nombre_rol,
        status: user.estatus === "Activa" ? "Activo" : "Suspendido",
      })),
      books: books.rows.map((book) => ({
        ...book,
        type: book.type === "Reserva" ? "Reserva" : "General",
        copies: Number(book.copies),
        available: Number(book.available),
        pages: book.paginas,
        edition: book.edicion,
        price: book.price,
        publisher: book.publisher,
      })),
      dashboard: {
        currentUser: currentUser.rows[0] ?? { name: "Bibliotecario", role: "Bibliotecario" },
        availability: inventory.rows[0] ?? { total: 0, available: 0, borrowed: 0 },
        activity: activity.rows.map((item) => ({
          icon: item.icon,
          title: item.title,
          detail: `${item.detail} · registro ${item.event_id}`,
        })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  const body = await request.json().catch(() => null) as
    | { resource?: "user" | "book"; data?: UserPayload | BookPayload }
    | null;

  if (!body?.resource || !body.data) {
    return NextResponse.json({ error: "La solicitud no tiene un recurso válido." }, { status: 400 });
  }
  if (body.resource === "user" && session.role !== "Administrador") {
    return NextResponse.json({ error: "Solo el administrador puede crear usuarios." }, { status: 403 });
  }
  if (body.resource === "book" && !["Administrador", "Bibliotecario"].includes(session.role)) {
    return NextResponse.json({ error: "No tienes permisos para crear libros." }, { status: 403 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (body.resource === "user") {
      const data = body.data as UserPayload;
      if (!data.name || !data.identifier || !data.email || !data.password || !["Alumno", "Profesor", "Bibliotecario"].includes(data.role)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Completa todos los datos del usuario." }, { status: 400 });
      }

      const roleName = data.role;
      const role = await client.query("SELECT id_rol FROM ROLES WHERE nombre_rol = $1", [roleName]);
      if (role.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `No existe el rol ${roleName} en la base de datos.` }, { status: 400 });
      }
      const credential = await client.query(
        `INSERT INTO CREDENCIALES (id_rol, matricula_nomina, contrasena_hash)
         VALUES ($1, $2, $3) RETURNING id_credencial`,
        [role.rows[0].id_rol, data.identifier, hashPassword(data.password)],
      );
      const credentialId = credential.rows[0].id_credencial;

      if (data.role === "Alumno") {
        await client.query(
          "INSERT INTO ALUMNOS (matricula, id_credencial, nombre_completo, correo_institucional) VALUES ($1, $2, $3, $4)",
          [data.identifier, credentialId, data.name, data.email],
        );
      } else if (data.role === "Profesor") {
        await client.query(
          "INSERT INTO PROFESORES (nomina, id_credencial, nombre_completo, correo_institucional) VALUES ($1, $2, $3, $4)",
          [data.identifier, credentialId, data.name, data.email],
        );
      } else {
        await client.query(
          "INSERT INTO PERSONAL_BIBLIOTECA (id_credencial, nomina, nombre_completo, puesto) VALUES ($1, $2, $3, $4)",
          [credentialId, data.identifier, data.name, "Bibliotecario"],
        );
      }
    } else {
      const data = body.data as BookPayload;
      const copies = Number(data.copies);
      if (!data.title || !data.author || !data.isbn || !data.category || !data.location || !Number.isInteger(copies) || copies < 1) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Completa todos los datos del libro." }, { status: 400 });
      }

      const editorial = await client.query(
        `INSERT INTO EDITORIALES (nombre_editorial) VALUES ('Editorial SIGEB')
         ON CONFLICT (nombre_editorial) DO UPDATE SET nombre_editorial = EXCLUDED.nombre_editorial
         RETURNING id_editorial`,
      );
      const topic = await client.query(
        `INSERT INTO TEMAS (nombre_tema) VALUES ($1)
         ON CONFLICT (nombre_tema) DO UPDATE SET nombre_tema = EXCLUDED.nombre_tema
         RETURNING id_tema`,
        [data.category],
      );
      const author = await client.query(
        "INSERT INTO AUTORES (nombre_autor) VALUES ($1) RETURNING id_autor",
        [data.author],
      );
      await client.query(
        `INSERT INTO LIBROS (id_libro, isbn, titulo, id_editorial, id_tema, tipo_uso)
         VALUES ($1, $1, $2, $3, $4, 'General')`,
        [data.isbn, data.title, editorial.rows[0].id_editorial, topic.rows[0].id_tema],
      );
      await client.query("INSERT INTO LIBRO_AUTOR (id_libro, id_autor) VALUES ($1, $2)", [data.isbn, author.rows[0].id_autor]);
      for (let index = 1; index <= copies; index += 1) {
        await client.query(
          `INSERT INTO EJEMPLARES (id_libro, clave_ejemplar, estado, piso, area, pasillo, estante)
           VALUES ($1, $2, 'Disponible', $3, 'General', 'A', $4)`,
          [data.isbn, `${data.isbn}-${String(index).padStart(3, "0")}`, data.location.split(" · ")[0], data.location.split("-").pop() ?? "01"],
        );
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    return errorResponse(error);
  } finally {
    client.release();
  }
}
