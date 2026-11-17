/**
 * Autenticación con token JWT (Propuesta 3.3) y control de acceso por perfil.
 * Cada cuenta tiene un perfil con permisos (HU6-SP0); los permisos viajan en el
 * token, así que un cambio de perfil aplica desde el siguiente inicio de sesión.
 * La matriz la usan el API Gateway (NGINX auth_request) y cada servicio.
 */
import { jwtVerify, SignJWT } from "jose";
import type { RolUsuario } from "./dominio/politicas";
import { config } from "./config";

/** Funciones del sistema que se pueden dar a un perfil. */
export const PERMISOS_SISTEMA = {
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
export type Permiso = keyof typeof PERMISOS_SISTEMA;
export const LISTA_PERMISOS = Object.keys(PERMISOS_SISTEMA) as Permiso[];

/** Perfiles base: los mismos que carga db/datos-base.sql (respaldo para tokens sin permisos). */
export const PERFILES_BASE: Record<RolUsuario, Permiso[]> = {
  Administrador: ["buscar-libros", "gestionar-libros", "prestamos", "devoluciones", "multas", "suspensiones", "cuentas", "perfiles", "compras", "chatbot"],
  Bibliotecario: ["buscar-libros", "gestionar-libros", "prestamos", "devoluciones", "multas", "suspensiones", "chatbot"],
  Alumno: ["buscar-libros", "mis-prestamos", "chatbot"],
  Profesor: ["buscar-libros", "mis-prestamos", "chatbot"],
  Colaborador: ["buscar-libros", "mis-prestamos", "chatbot"],
};

export type Sesion = { id: number; identificador: string; nombre: string; rol: RolUsuario | "Servicio"; perfil?: string; permisos?: Permiso[] };

export const COOKIE_SESION = "sigeb_token";

const clave = () => new TextEncoder().encode(config.jwtSecreto);

export async function firmarToken(sesion: Sesion, horas = config.horasSesion): Promise<string> {
  return new SignJWT({ identificador: sesion.identificador, nombre: sesion.nombre, rol: sesion.rol, perfil: sesion.perfil, permisos: sesion.permisos })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(sesion.id))
    .setIssuer("sigeb")
    .setIssuedAt()
    .setExpirationTime(`${horas}h`)
    .sign(clave());
}

export async function verificarToken(token: string): Promise<Sesion | null> {
  try {
    const { payload } = await jwtVerify(token, clave(), { issuer: "sigeb", algorithms: ["HS256"] });
    const { sub, identificador, nombre, rol, perfil, permisos } = payload as Record<string, unknown>;
    if (typeof sub !== "string" || typeof identificador !== "string" || typeof nombre !== "string" || typeof rol !== "string") return null;
    const sesion: Sesion = { id: Number(sub), identificador, nombre, rol: rol as Sesion["rol"] };
    if (typeof perfil === "string") sesion.perfil = perfil;
    if (Array.isArray(permisos)) sesion.permisos = permisos.filter((p): p is Permiso => typeof p === "string" && p in PERMISOS_SISTEMA);
    return sesion;
  } catch {
    return null;
  }
}

/** Permisos efectivos: los del perfil del token o, si no vienen, los del perfil base del tipo de cuenta. */
export function permisosDe(sesion: Sesion): Permiso[] {
  if (sesion.permisos) return sesion.permisos;
  return sesion.rol === "Servicio" ? LISTA_PERMISOS : PERFILES_BASE[sesion.rol] ?? [];
}

/** El token llega en cookie (web) o en el encabezado Authorization (app móvil). */
export function extraerToken(encabezados: { authorization?: string; cookie?: string }, cookies?: Record<string, string>): string | undefined {
  const bearer = encabezados.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return bearer;
  if (cookies?.[COOKIE_SESION]) return cookies[COOKIE_SESION];
  return encabezados.cookie?.split(";").map((parte) => parte.trim().split("=")).find(([nombre]) => nombre === COOKIE_SESION)?.[1];
}

/**
 * Permisos por ruta del gateway. Cada entrada corresponde a una función del
 * Product Backlog; basta con tener uno de los permisos listados.
 */
export const PERMISOS: Array<{ prefijo: string; funcion: string; permisos: Permiso[] }> = [
  { prefijo: "/api/usuarios", funcion: "Gestión de cuentas", permisos: ["cuentas"] },
  { prefijo: "/api/perfiles", funcion: "Gestión de perfiles", permisos: ["perfiles"] },
  { prefijo: "/api/libros", funcion: "Gestionar libros", permisos: ["gestionar-libros"] },
  { prefijo: "/api/solicitudes-compra", funcion: "Gestionar libros", permisos: ["gestionar-libros", "compras"] },
  { prefijo: "/api/compras", funcion: "Compra de libros", permisos: ["compras"] },
  { prefijo: "/api/busqueda", funcion: "Buscar libros", permisos: ["buscar-libros"] },
  { prefijo: "/api/prestamos", funcion: "Prestar libros", permisos: ["prestamos", "devoluciones"] },
  { prefijo: "/api/lista-espera", funcion: "Prestar libros", permisos: ["prestamos"] },
  { prefijo: "/api/recibos", funcion: "Prestar libros / Gestión de multas", permisos: ["prestamos", "multas"] },
  { prefijo: "/api/devoluciones", funcion: "Devolver libros", permisos: ["devoluciones"] },
  { prefijo: "/api/multas", funcion: "Gestión de multas", permisos: ["multas"] },
  { prefijo: "/api/adeudos", funcion: "Gestión de multas", permisos: ["multas"] },
  { prefijo: "/api/tipo-cambio", funcion: "Gestión de multas", permisos: ["multas"] },
  { prefijo: "/api/suspensiones", funcion: "Alumnos suspendidos", permisos: ["suspensiones"] },
  { prefijo: "/api/chatbot", funcion: "Chatbot", permisos: ["chatbot"] },
];

/** Rutas que no requieren sesión: iniciar sesión y salud del servicio. */
const PUBLICAS = [/^\/api\/auth\/sesion$/, /^\/api\/[a-z-]+\/salud$/, /^\/salud$/];

export const SIN_PERMISO = "No tienes permisos para acceder a esta función.";
export const SOLO_ADMIN_ALTA = "Solo el administrador puede dar de alta cuentas.";

export type ResultadoAcceso = { permitido: true } | { permitido: false; estado: 401 | 403; mensaje: string };

export function evaluarAcceso(ruta: string, sesion: Sesion | null, metodo = "GET"): ResultadoAcceso {
  const limpia = ruta.split("?")[0];
  if (PUBLICAS.some((patron) => patron.test(limpia))) return { permitido: true };
  if (!sesion) return { permitido: false, estado: 401, mensaje: "Debes iniciar sesión." };
  if (sesion.rol === "Servicio") return { permitido: true };
  // Su propia cuenta (datos, préstamos y multas) la consulta cualquier sesión.
  if (limpia.startsWith("/api/auth/")) return { permitido: true };
  const regla = PERMISOS.find((permiso) => limpia === permiso.prefijo || limpia.startsWith(`${permiso.prefijo}/`));
  if (!regla) return { permitido: false, estado: 403, mensaje: `La ruta ${limpia} no pertenece a ninguna función del sistema.` };
  const propios = permisosDe(sesion);
  if (regla.permisos.some((p) => propios.includes(p))) return { permitido: true };
  // HU2-SP0, escenario 4: el bibliotecario que intenta dar de alta cuentas.
  const mensaje = regla.prefijo === "/api/usuarios" && metodo.toUpperCase() === "POST" ? SOLO_ADMIN_ALTA : SIN_PERMISO;
  return { permitido: false, estado: 403, mensaje };
}

/** Texto JSON en ASCII (\uXXXX) para pasar el mensaje al gateway en un encabezado HTTP. */
export function jsonAscii(texto: string): string {
  return JSON.stringify(texto).slice(1, -1).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
