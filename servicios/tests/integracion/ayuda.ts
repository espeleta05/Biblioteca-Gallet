/**
 * Utilidades para pruebas de integración (SWEBOK 05: interacción entre módulos
 * y base de datos). Usan una base PostgreSQL de pruebas que se recrea con
 * db/esquema.sql, db/datos-base.sql y db/datos-prueba.sql antes de cada archivo de pruebas.
 */
process.env.DATABASE_URL ??= "postgres://sigeb@localhost:55432/sigeb";
process.env.JWT_SECRET ??= "secreto-de-pruebas-sigeb-0123456789-abcdef";
process.env.URL_BD_ESCOLAR ??= "http://localhost:4101";
process.env.URL_TESORERIA ??= "http://localhost:4102";

import { readFileSync } from "fs";
import { join } from "path";
import type { INestApplication, Type } from "@nestjs/common";
import request from "supertest";
import { cerrarPool, obtenerPool } from "../../comun/db";
import { crearAplicacion } from "../../comun/nest";

const RAIZ = join(__dirname, "..", "..", "..");

export async function reiniciarBase(): Promise<void> {
  const pool = obtenerPool();
  await pool.query(readFileSync(join(RAIZ, "db", "esquema.sql"), "utf8"));
  await pool.query(readFileSync(join(RAIZ, "db", "datos-base.sql"), "utf8"));
  await pool.query(readFileSync(join(RAIZ, "db", "datos-prueba.sql"), "utf8"));
}

export async function levantar(modulo: Type<unknown>, nombre: string): Promise<INestApplication> {
  const app = await crearAplicacion(modulo, nombre);
  await app.init();
  return app;
}

export async function apagar(...apps: INestApplication[]): Promise<void> {
  for (const app of apps) await app.close();
  await cerrarPool();
}

/** Inicia sesión contra el servicio de usuarios y devuelve el encabezado Authorization. */
export async function tokenDe(appUsuarios: INestApplication, identificador: string, contrasena = "1234"): Promise<string> {
  const respuesta = await request(appUsuarios.getHttpServer()).post("/api/auth/sesion").send({ identificador, contrasena });
  if (respuesta.status !== 200) throw new Error(`No se pudo iniciar sesión como ${identificador}: ${JSON.stringify(respuesta.body)}`);
  return `Bearer ${respuesta.body.token}`;
}

export async function idDe(identificador: string): Promise<number> {
  const { rows } = await obtenerPool().query<{ id_credencial: number }>("SELECT id_credencial FROM CREDENCIALES WHERE matricula_nomina = $1", [identificador]);
  if (!rows[0]) throw new Error(`No existe ${identificador} en los datos de prueba.`);
  return rows[0].id_credencial;
}
