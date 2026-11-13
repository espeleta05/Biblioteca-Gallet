/**
 * Acceso a la base de datos propia de SIGEB (PostgreSQL). Todas las consultas
 * son parametrizadas; las operaciones que tocan varias tablas van en una
 * transacción para que el estado del libro y del usuario se actualice de forma
 * atómica (RNF "registro en tiempo real").
 */
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { types } from "pg";
import { config } from "./config";

// DATE (OID 1082) se devuelve como texto "AAAA-MM-DD" para no introducir husos horarios.
types.setTypeParser(1082, (valor: string) => valor);
// NUMERIC (OID 1700) se devuelve como número.
types.setTypeParser(1700, (valor: string) => Number(valor));

let pool: Pool | undefined;

export function obtenerPool(): Pool {
  pool ??= new Pool({ connectionString: config.databaseUrl, max: 10 });
  return pool;
}

export async function cerrarPool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export type Ejecutor = Pick<PoolClient, "query">;

export async function consultar<T extends QueryResultRow>(sql: string, parametros: unknown[] = [], ejecutor: Ejecutor = obtenerPool()): Promise<T[]> {
  const resultado = await ejecutor.query<T>(sql, parametros);
  return resultado.rows;
}

export async function consultarUno<T extends QueryResultRow>(sql: string, parametros: unknown[] = [], ejecutor: Ejecutor = obtenerPool()): Promise<T | undefined> {
  return (await consultar<T>(sql, parametros, ejecutor))[0];
}

export async function enTransaccion<T>(trabajo: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await trabajo(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

/** Bitácora de operaciones: evidencia para ISO 9001:2015. */
export async function registrarEnBitacora(ejecutor: Ejecutor, servicio: string, accion: string, detalle: string, idCredencial?: number): Promise<void> {
  await ejecutor.query(
    "INSERT INTO BITACORA (servicio, accion, detalle, id_credencial) VALUES ($1, $2, $3, $4)",
    [servicio, accion, detalle.slice(0, 500), idCredencial ?? null],
  );
}
