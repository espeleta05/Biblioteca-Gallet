import { NextResponse } from "next/server";
import { createSession, getSession, sessionCookie, verifyPassword } from "../../../lib/auth";
import { pool } from "../../../lib/db";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ session });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { identifier?: string; password?: string } | null;
  if (!body?.identifier || !body.password) {
    return NextResponse.json({ error: "Ingresa tu usuario y contraseña." }, { status: 400 });
  }

  try {
    const result = await pool.query(`
      SELECT c.id_credencial, c.matricula_nomina, c.contrasena_hash, c.estatus,
        r.nombre_rol,
        COALESCE(a.nombre_completo, p.nombre_completo, b.nombre_completo) AS nombre
      FROM CREDENCIALES c
      JOIN ROLES r ON r.id_rol = c.id_rol
      LEFT JOIN ALUMNOS a ON a.id_credencial = c.id_credencial
      LEFT JOIN PROFESORES p ON p.id_credencial = c.id_credencial
      LEFT JOIN PERSONAL_BIBLIOTECA b ON b.id_credencial = c.id_credencial
      WHERE LOWER(TRIM(c.matricula_nomina)) = LOWER(TRIM($1))
    `, [body.identifier]);
    const user = result.rows[0];
    if (!user || user.estatus !== "Activa" || !verifyPassword(body.password, user.contrasena_hash)) {
      return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
    }

    const session = {
      id: String(user.id_credencial),
      identifier: user.matricula_nomina,
      name: user.nombre || user.matricula_nomina,
      role: user.nombre_rol,
    };
    const response = NextResponse.json({ session });
    response.cookies.set(sessionCookie, createSession(session), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    return NextResponse.json({ error: "No fue posible conectar con PostgreSQL." }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie, "", { httpOnly: true, expires: new Date(0), path: "/" });
  return response;
}
