import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { pool } from "../../../lib/db";

export const dynamic = "force-dynamic";

type Action =
  | "loan"
  | "renew"
  | "return"
  | "waitlist"
  | "pay-fine"
  | "revoke-fine"
  | "suspend";

function addBusinessDays(start: Date, days: number) {
  const result = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result.toISOString().slice(0, 10);
}

function daysLate(dueDate: string | Date) {
  const due = new Date(dueDate);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((today.getTime() - due.getTime()) / 86400000));
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const session = await getSession();
  if (!session) return fail("Debes iniciar sesión.", 401);
  try {
    const [loans, fines, waits, users, books, renewals, suspensions] = await Promise.all([
      pool.query(`
        SELECT p.id_prestamo AS id, p.id_ejemplar AS exemplar_id, p.id_credencial AS user_id,
          p.fecha_prestamo, p.fecha_vencimiento, p.fecha_devolucion, p.estado,
          l.titulo AS title, l.isbn, e.clave_ejemplar, c.matricula_nomina AS identifier,
          COALESCE(a.nombre_completo, pr.nombre_completo, b.nombre_completo, c.matricula_nomina) AS user_name
        FROM PRESTAMOS p
        JOIN EJEMPLARES e ON e.id_ejemplar = p.id_ejemplar
        JOIN LIBROS l ON l.id_libro = e.id_libro
        JOIN CREDENCIALES c ON c.id_credencial = p.id_credencial
        LEFT JOIN ALUMNOS a ON a.id_credencial = c.id_credencial
        LEFT JOIN PROFESORES pr ON pr.id_credencial = c.id_credencial
        LEFT JOIN PERSONAL_BIBLIOTECA b ON b.id_credencial = c.id_credencial
        WHERE $1 = 'Administrador' OR $1 = 'Bibliotecario' OR p.id_credencial = $2
        ORDER BY p.fecha_prestamo DESC
      `, [session.role, session.id]),
      pool.query(`
        SELECT m.id_multa AS id, m.id_credencial AS user_id, m.id_prestamo AS loan_id,
          m.monto_mxn AS amount, m.motivo, m.estatus AS status, m.fecha_generacion,
          c.matricula_nomina AS identifier,
          COALESCE(a.nombre_completo, pr.nombre_completo, b.nombre_completo, c.matricula_nomina) AS user_name
        FROM MULTAS m JOIN CREDENCIALES c ON c.id_credencial = m.id_credencial
        LEFT JOIN ALUMNOS a ON a.id_credencial = c.id_credencial
        LEFT JOIN PROFESORES pr ON pr.id_credencial = c.id_credencial
        LEFT JOIN PERSONAL_BIBLIOTECA b ON b.id_credencial = c.id_credencial
        WHERE $1 = 'Administrador' OR $1 = 'Bibliotecario' OR m.id_credencial = $2
        ORDER BY m.fecha_generacion DESC
      `, [session.role, session.id]),
      pool.query(`
        SELECT e.id_espera AS id, e.id_libro AS book_id, e.id_credencial AS user_id,
          e.fecha_solicitud, e.estado, l.titulo AS title, c.matricula_nomina AS identifier
        FROM LISTA_ESPERA e JOIN LIBROS l ON l.id_libro = e.id_libro
        JOIN CREDENCIALES c ON c.id_credencial = e.id_credencial
        WHERE $1 = 'Administrador' OR $1 = 'Bibliotecario' OR e.id_credencial = $2
        ORDER BY e.fecha_solicitud
      `, [session.role, session.id]),
      pool.query(`
        SELECT c.id_credencial AS id,
          COALESCE(a.nombre_completo, pr.nombre_completo, b.nombre_completo, c.matricula_nomina) AS name,
          c.matricula_nomina AS identifier,
          r.nombre_rol AS role,
          c.estatus AS status,
          COALESCE(a.correo_institucional, pr.correo_institucional, b.correo_institucional, '') AS email,
          COALESCE(a.telefono, pr.telefono, '') AS phone,
          r.dias_prestamo, r.max_ejemplares, r.max_renovaciones
        FROM CREDENCIALES c
        JOIN ROLES r ON r.id_rol = c.id_rol
        LEFT JOIN ALUMNOS a ON a.id_credencial = c.id_credencial
        LEFT JOIN PROFESORES pr ON pr.id_credencial = c.id_credencial
        LEFT JOIN PERSONAL_BIBLIOTECA b ON b.id_credencial = c.id_credencial
        ORDER BY name
      `),
      pool.query(`
        SELECT l.id_libro AS id, l.titulo AS title, l.isbn,
          COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Disponible')::int AS available
        FROM LIBROS l
        LEFT JOIN EJEMPLARES e ON e.id_libro = l.id_libro
        GROUP BY l.id_libro, l.titulo, l.isbn
        ORDER BY l.titulo
      `),
      pool.query(`
        SELECT r.id_renovacion AS id, p.id_credencial AS user_id,
          r.id_prestamo AS loan_id, r.fecha_renovacion,
          r.fecha_vencimiento_anterior, r.fecha_vencimiento_nueva
        FROM RENOVACIONES r JOIN PRESTAMOS p ON p.id_prestamo = r.id_prestamo
        WHERE $1 = 'Administrador' OR $1 = 'Bibliotecario' OR p.id_credencial = $2
        ORDER BY r.fecha_renovacion DESC
      `, [session.role, session.id]),
      pool.query(`
        SELECT id_suspension AS id, id_credencial AS user_id, motivo,
          fecha_inicio, fecha_fin, estado
        FROM SUSPENSIONES
        WHERE $1 = 'Administrador' OR $1 = 'Bibliotecario' OR id_credencial = $2
        ORDER BY fecha_inicio DESC
      `, [session.role, session.id]),
    ]);
    return NextResponse.json({ loans: loans.rows, fines: fines.rows, waitlist: waits.rows, users: users.rows, books: books.rows, renewals: renewals.rows, suspensions: suspensions.rows });
  } catch (error) {
    console.error("Error al consultar circulación:", error);
    return fail("No fue posible consultar préstamos y multas.", 500);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Debes iniciar sesión.", 401);
  const body = await request.json().catch(() => null) as {
    action?: Action;
    loanId?: number;
    bookId?: string;
    userId?: number;
    reason?: "Daño" | "Pérdida";
    amount?: number;
    reference?: string;
    message?: string;
  } | null;
  if (!body?.action) return fail("Falta la operación solicitada.");

  const managementActions: Action[] = ["loan", "renew", "return", "pay-fine", "revoke-fine", "suspend"];
  if (managementActions.includes(body.action) && !["Administrador", "Bibliotecario"].includes(session.role)) {
    return fail("Solo el administrador o bibliotecario puede realizar esta operación.", 403);
  }
  if (["pay-fine", "revoke-fine", "suspend"].includes(body.action) && session.role !== "Administrador") {
    return fail("Solo el administrador puede gestionar esta operación.", 403);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const targetUser = body.userId ?? Number(session.id);

    if (body.action === "loan") {
      if (!body.bookId || !body.userId) {
        await client.query("ROLLBACK");
        return fail("Selecciona el usuario y el libro.");
      }
      const user = await client.query(`
        SELECT c.id_credencial, c.estatus, r.nombre_rol, r.dias_prestamo, r.max_ejemplares
        FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol
        WHERE c.id_credencial = $1
      `, [body.userId]);
      if (!user.rowCount || user.rows[0].estatus !== "Activa") {
        await client.query("ROLLBACK");
        return fail("El usuario no existe o está inactivo.");
      }
      const suspension = await client.query(`
        SELECT 1 FROM SUSPENSIONES
        WHERE id_credencial = $1 AND estado = 'Activa'
          AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
      `, [body.userId]);
      if (suspension.rowCount) {
        await client.query("ROLLBACK");
        return fail("El usuario está suspendido y no puede recibir préstamos.", 409);
      }
      const debt = await client.query(
        "SELECT 1 FROM MULTAS WHERE id_credencial = $1 AND estatus = 'Pendiente' LIMIT 1",
        [body.userId],
      );
      if (debt.rowCount) {
        await client.query("ROLLBACK");
        return fail("El usuario tiene multas pendientes.", 409);
      }
      const active = await client.query(
        "SELECT COUNT(*)::int AS count FROM PRESTAMOS WHERE id_credencial = $1 AND estado = 'Activo'",
        [body.userId],
      );
      if (Number(active.rows[0].count) >= Number(user.rows[0].max_ejemplares)) {
        await client.query("ROLLBACK");
        return fail("El usuario alcanzó el límite de ejemplares permitidos.", 409);
      }
      const exemplar = await client.query(`
        SELECT e.id_ejemplar FROM EJEMPLARES e
        WHERE e.id_libro = $1 AND e.estado = 'Disponible'
        ORDER BY e.id_ejemplar FOR UPDATE LIMIT 1
      `, [body.bookId]);
      if (!exemplar.rowCount) {
        await client.query("ROLLBACK");
        return fail("No hay ejemplares disponibles para este libro.", 409);
      }
      const due = addBusinessDays(new Date(), Number(user.rows[0].dias_prestamo));
      const loan = await client.query(`
        INSERT INTO PRESTAMOS (id_ejemplar, id_credencial, fecha_vencimiento)
        VALUES ($1, $2, $3) RETURNING id_prestamo, fecha_vencimiento
      `, [exemplar.rows[0].id_ejemplar, body.userId, due]);
      await client.query("UPDATE EJEMPLARES SET estado = 'Prestado' WHERE id_ejemplar = $1", [exemplar.rows[0].id_ejemplar]);
      await client.query("INSERT INTO ACTIVIDAD_SISTEMA (tipo, titulo, detalle) VALUES ('loans', 'Préstamo registrado', $1)", [`usuario ${body.userId} · libro ${body.bookId}`]);
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, loan: loan.rows[0] }, { status: 201 });
    }

    if (body.action === "renew") {
      if (!body.loanId) {
        await client.query("ROLLBACK");
        return fail("Falta el préstamo.");
      }
      const loan = await client.query(`
        SELECT p.*, r.max_renovaciones, r.dias_prestamo,
          (SELECT COUNT(*) FROM RENOVACIONES r2 WHERE r2.id_prestamo = p.id_prestamo) AS renewals
        FROM PRESTAMOS p JOIN CREDENCIALES c ON c.id_credencial = p.id_credencial
        JOIN ROLES r ON r.id_rol = c.id_rol
        WHERE p.id_prestamo = $1 FOR UPDATE
      `, [body.loanId]);
      if (!loan.rowCount || loan.rows[0].estado !== "Activo") {
        await client.query("ROLLBACK");
        return fail("El préstamo no está activo.");
      }
      if (daysLate(loan.rows[0].fecha_vencimiento) > 0 || Number(loan.rows[0].renewals) >= Number(loan.rows[0].max_renovaciones)) {
        await client.query("ROLLBACK");
        return fail("El préstamo no puede renovarse.", 409);
      }
      const nextDue = addBusinessDays(new Date(loan.rows[0].fecha_vencimiento), Number(loan.rows[0].dias_prestamo));
      await client.query(`
        INSERT INTO RENOVACIONES (id_prestamo, id_credencial_autoriza, fecha_vencimiento_anterior, fecha_vencimiento_nueva)
        VALUES ($1, $2, $3, $4)
      `, [body.loanId, session.id, loan.rows[0].fecha_vencimiento, nextDue]);
      await client.query("UPDATE PRESTAMOS SET fecha_vencimiento = $1 WHERE id_prestamo = $2", [nextDue, body.loanId]);
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, dueDate: nextDue });
    }

    if (body.action === "return") {
      if (!body.loanId) {
        await client.query("ROLLBACK");
        return fail("Falta el préstamo.");
      }
      const loan = await client.query(`
        SELECT p.*, l.precio_ultima_compra_usd,
          COALESCE((SELECT valor_mxn FROM TIPO_CAMBIO ORDER BY fecha DESC LIMIT 1), 17.5) AS exchange_rate
        FROM PRESTAMOS p
        JOIN EJEMPLARES e ON e.id_ejemplar = p.id_ejemplar
        JOIN LIBROS l ON l.id_libro = e.id_libro
        WHERE p.id_prestamo = $1
        FOR UPDATE OF p
      `, [body.loanId]);
      if (!loan.rowCount || loan.rows[0].estado !== "Activo") {
        await client.query("ROLLBACK");
        return fail("El préstamo no está activo.");
      }
      const late = daysLate(loan.rows[0].fecha_vencimiento);
      const reason = body.reason;
      const replacementCost = Number(loan.rows[0].precio_ultima_compra_usd ?? 0) * Number(loan.rows[0].exchange_rate ?? 17.5);
      const fineAmount = reason === "Pérdida" || reason === "Daño" ? replacementCost : late * 10;
      await client.query("UPDATE PRESTAMOS SET fecha_devolucion = CURRENT_TIMESTAMP, estado = 'Devuelto' WHERE id_prestamo = $1", [body.loanId]);
      await client.query("UPDATE EJEMPLARES SET estado = $1 WHERE id_ejemplar = $2", [reason ?? "Disponible", loan.rows[0].id_ejemplar]);
      if (reason || fineAmount > 0) {
        await client.query(`
          INSERT INTO MULTAS (id_prestamo, id_credencial, monto_mxn, motivo)
          VALUES ($1, $2, $3, $4)
        `, [body.loanId, loan.rows[0].id_credencial, fineAmount, reason ?? "Retraso"]);
      }
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, fine: fineAmount > 0 || Boolean(reason), lateDays: late });
    }

    if (body.action === "waitlist") {
      if (!body.bookId) {
        await client.query("ROLLBACK");
        return fail("Falta el libro.");
      }
      const existing = await client.query(
        "SELECT 1 FROM LISTA_ESPERA WHERE id_libro = $1 AND id_credencial = $2 AND estado = 'En espera'",
        [body.bookId, targetUser],
      );
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        return fail("Ya estás en la lista de espera para este libro.", 409);
      }
      await client.query("INSERT INTO LISTA_ESPERA (id_libro, id_credencial) VALUES ($1, $2)", [body.bookId, targetUser]);
      await client.query("COMMIT");
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    if (!body.loanId && body.action !== "suspend") {
      await client.query("ROLLBACK");
      return fail("Falta el identificador de la operación.");
    }
    if (body.action === "pay-fine") {
      const fine = await client.query("SELECT * FROM MULTAS WHERE id_multa = $1 FOR UPDATE", [body.loanId]);
      if (!fine.rowCount || fine.rows[0].estatus !== "Pendiente") {
        await client.query("ROLLBACK");
        return fail("La multa no existe o ya fue pagada.");
      }
      await client.query("INSERT INTO PAGOS (id_multa, monto_pagado_mxn, referencia_tesoreria) VALUES ($1, $2, $3)", [body.loanId, body.amount ?? fine.rows[0].monto_mxn, body.reference ?? null]);
      await client.query("UPDATE MULTAS SET estatus = 'Pagada' WHERE id_multa = $1", [body.loanId]);
    } else if (body.action === "revoke-fine") {
      await client.query("UPDATE MULTAS SET estatus = 'Cancelada' WHERE id_multa = $1 AND estatus = 'Pendiente'", [body.loanId]);
    } else if (body.action === "suspend") {
      if (!body.userId || !body.message) {
        await client.query("ROLLBACK");
        return fail("Falta el usuario y el motivo de suspensión.");
      }
      await client.query("INSERT INTO SUSPENSIONES (id_credencial, motivo, fecha_inicio) VALUES ($1, $2, CURRENT_DATE)", [body.userId, body.message]);
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en operación de circulación:", error);
    return fail("No fue posible completar la operación de circulación.", 500);
  } finally {
    client.release();
  }
}
