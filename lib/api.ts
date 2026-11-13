/**
 * Cliente HTTP de la aplicación web. Todas las peticiones pasan por el API
 * Gateway (NGINX) bajo /api; la sesión viaja en la cookie httpOnly sigeb_token.
 * Los errores llegan con el formato uniforme { error, motivos }.
 */

export class ErrorApi extends Error {
  constructor(message: string, public readonly estado: number, public readonly motivos: string[] = []) {
    super(message);
  }
}

export async function api<T>(ruta: string, opciones: { metodo?: "GET" | "POST" | "PATCH" | "DELETE"; cuerpo?: unknown } = {}): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: opciones.metodo ?? "GET",
      credentials: "include",
      cache: "no-store",
      headers: opciones.cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    });
  } catch {
    throw new ErrorApi("No hay conexión con el servidor de la biblioteca.", 0);
  }
  const texto = await respuesta.text();
  const datos = texto ? JSON.parse(texto) : {};
  if (!respuesta.ok) throw new ErrorApi(datos.error ?? `Error ${respuesta.status}`, respuesta.status, datos.motivos ?? []);
  return datos as T;
}

/** Construye una cadena de consulta ignorando valores vacíos. */
export function consulta(parametros: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) if (valor !== undefined && valor !== null && valor !== "") p.set(clave, String(valor));
  const texto = p.toString();
  return texto ? `?${texto}` : "";
}

export const pesos = (monto: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(monto);
export const fecha = (valor: string) => new Date(valor.length === 10 ? `${valor}T12:00:00` : valor).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

export type Rol = "Administrador" | "Bibliotecario" | "Alumno" | "Profesor" | "Colaborador";
export type Sesion = { id: number; identificador: string; nombre: string; rol: Rol };
export const esPersonal = (rol: Rol) => rol === "Administrador" || rol === "Bibliotecario";
