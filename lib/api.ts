/**
 * Cliente HTTP de la aplicación web. Todas las peticiones pasan por el API
 * Gateway (NGINX) bajo /api; la sesión viaja en la cookie httpOnly sigeb_token.
 * Los errores llegan con el formato uniforme { error, motivos }.
 */

export class ErrorApi extends Error {
  /** campos: nombres de los campos del formulario que el servidor marcó con error. */
  constructor(message: string, public readonly estado: number, public readonly motivos: string[] = [], public readonly campos: string[] = []) {
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
  if (!respuesta.ok) throw new ErrorApi(datos.error ?? `Error ${respuesta.status}`, respuesta.status, datos.motivos ?? [], datos.campos ?? []);
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
export const TIPOS_CUENTA: Rol[] = ["Administrador", "Bibliotecario", "Alumno", "Profesor", "Colaborador"];

/** Funciones que se pueden dar a un perfil (las mismas que servicios/comun/auth.ts). */
export const PERMISOS = {
  "buscar-libros": "Buscar libros",
  "mis-prestamos": "Consultar mis préstamos",
  "gestionar-libros": "Gestionar libros",
  prestamos: "Prestar libros",
  devoluciones: "Devolver libros",
  multas: "Gestión de multas",
  suspensiones: "Alumnos suspendidos",
  cuentas: "Gestión de cuentas",
  perfiles: "Gestión de perfiles",
  compras: "Compra de libros",
  chatbot: "Asistente (chatbot)",
} as const;
export type Permiso = keyof typeof PERMISOS;

const PERFILES_BASE: Record<Rol, Permiso[]> = {
  Administrador: ["buscar-libros", "gestionar-libros", "prestamos", "devoluciones", "multas", "suspensiones", "cuentas", "perfiles", "compras", "chatbot"],
  Bibliotecario: ["buscar-libros", "gestionar-libros", "prestamos", "devoluciones", "multas", "suspensiones", "chatbot"],
  Alumno: ["buscar-libros", "mis-prestamos", "chatbot"],
  Profesor: ["buscar-libros", "mis-prestamos", "chatbot"],
  Colaborador: ["buscar-libros", "mis-prestamos", "chatbot"],
};

export type Sesion = { id: number; identificador: string; nombre: string; rol: Rol; perfil?: string; permisos?: Permiso[] };
export const permisosDe = (s: Sesion): Permiso[] => s.permisos ?? PERFILES_BASE[s.rol] ?? [];
export const puede = (s: Sesion, p: Permiso) => permisosDe(s).includes(p);
export const esPersonal = (rol: Rol) => rol === "Administrador" || rol === "Bibliotecario";
