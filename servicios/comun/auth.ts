/**
 * Autenticación con token JWT (Propuesta 3.3) y control de acceso por rol.
 * La matriz de permisos sale de las columnas "Usuarios" del Product Backlog
 * (Propuesta 2.3): la usan el API Gateway (NGINX auth_request) y cada servicio.
 */
import { jwtVerify, SignJWT } from "jose";
import type { RolUsuario } from "./dominio/politicas";
import { config } from "./config";

export type Sesion = { id: number; identificador: string; nombre: string; rol: RolUsuario | "Servicio" };

export const COOKIE_SESION = "sigeb_token";

const clave = () => new TextEncoder().encode(config.jwtSecreto);

export async function firmarToken(sesion: Sesion, horas = config.horasSesion): Promise<string> {
  return new SignJWT({ identificador: sesion.identificador, nombre: sesion.nombre, rol: sesion.rol })
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
    const { sub, identificador, nombre, rol } = payload as Record<string, unknown>;
    if (typeof sub !== "string" || typeof identificador !== "string" || typeof nombre !== "string" || typeof rol !== "string") return null;
    return { id: Number(sub), identificador, nombre, rol: rol as Sesion["rol"] };
  } catch {
    return null;
  }
}

/** El token llega en cookie (web) o en el encabezado Authorization (app móvil). */
export function extraerToken(encabezados: { authorization?: string; cookie?: string }, cookies?: Record<string, string>): string | undefined {
  const bearer = encabezados.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return bearer;
  if (cookies?.[COOKIE_SESION]) return cookies[COOKIE_SESION];
  return encabezados.cookie?.split(";").map((parte) => parte.trim().split("=")).find(([nombre]) => nombre === COOKIE_SESION)?.[1];
}

const PERSONAL: RolUsuario[] = ["Administrador", "Bibliotecario"];
const TODOS: RolUsuario[] = ["Administrador", "Bibliotecario", "Profesor", "Alumno", "Colaborador"];

/**
 * Permisos por ruta del gateway. Cada entrada corresponde a una función del
 * Product Backlog y a los usuarios marcados "ok" en la propuesta.
 */
export const PERMISOS: Array<{ prefijo: string; funcion: string; roles: RolUsuario[] }> = [
  { prefijo: "/api/usuarios", funcion: "Gestión de usuarios", roles: ["Administrador"] },
  { prefijo: "/api/libros", funcion: "Gestionar libros", roles: PERSONAL },
  { prefijo: "/api/solicitudes-compra", funcion: "Gestionar libros", roles: PERSONAL },
  { prefijo: "/api/busqueda", funcion: "Buscar libros", roles: TODOS },
  { prefijo: "/api/prestamos", funcion: "Prestar libros", roles: PERSONAL },
  { prefijo: "/api/lista-espera", funcion: "Prestar libros", roles: PERSONAL },
  { prefijo: "/api/recibos", funcion: "Prestar libros / Gestión de multas", roles: PERSONAL },
  { prefijo: "/api/devoluciones", funcion: "Devolver libros", roles: PERSONAL },
  { prefijo: "/api/multas", funcion: "Gestión de multas", roles: PERSONAL },
  { prefijo: "/api/adeudos", funcion: "Gestión de multas", roles: PERSONAL },
  { prefijo: "/api/tipo-cambio", funcion: "Gestión de multas", roles: PERSONAL },
  { prefijo: "/api/suspensiones", funcion: "Alumnos suspendidos", roles: PERSONAL },
  { prefijo: "/api/chatbot", funcion: "Chatbot", roles: TODOS },
];

/** Rutas que no requieren sesión: iniciar sesión y salud del servicio. */
const PUBLICAS = [/^\/api\/auth\/sesion$/, /^\/api\/[a-z-]+\/salud$/, /^\/salud$/];

export type ResultadoAcceso = { permitido: true } | { permitido: false; estado: 401 | 403; mensaje: string };

export function evaluarAcceso(ruta: string, sesion: Sesion | null): ResultadoAcceso {
  const limpia = ruta.split("?")[0];
  if (PUBLICAS.some((patron) => patron.test(limpia))) return { permitido: true };
  if (!sesion) return { permitido: false, estado: 401, mensaje: "Debes iniciar sesión." };
  if (sesion.rol === "Servicio") return { permitido: true };
  if (limpia.startsWith("/api/auth/")) return { permitido: true };
  const regla = PERMISOS.find((permiso) => limpia === permiso.prefijo || limpia.startsWith(`${permiso.prefijo}/`));
  if (!regla) return { permitido: false, estado: 403, mensaje: `La ruta ${limpia} no pertenece a ninguna función del sistema.` };
  return regla.roles.includes(sesion.rol)
    ? { permitido: true }
    : { permitido: false, estado: 403, mensaje: `Tu rol (${sesion.rol}) no tiene acceso a "${regla.funcion}".` };
}
