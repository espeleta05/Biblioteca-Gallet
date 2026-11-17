/**
 * Cliente de la app móvil. Usa el mismo API Gateway que la web; la sesión viaja
 * como token JWT en el encabezado Authorization y se guarda cifrado en el
 * dispositivo (expo-secure-store).
 */
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const URL_API: string = process.env.EXPO_PUBLIC_URL_API ?? (Constants.expoConfig?.extra?.urlApi as string);
const CLAVE_TOKEN = "sigeb_token";

export type Sesion = { id: number; identificador: string; nombre: string; rol: string };

export class ErrorApi extends Error {
  constructor(message: string, public readonly estado: number, public readonly motivos: string[] = []) { super(message); }
}

let token: string | null = null;

export async function cargarToken(): Promise<string | null> {
  token = await SecureStore.getItemAsync(CLAVE_TOKEN);
  return token;
}

async function pedir<T>(ruta: string, metodo: "GET" | "POST" | "DELETE" = "GET", cuerpo?: unknown): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_API}${ruta}`, {
      method: metodo,
      headers: { Accept: "application/json", ...(cuerpo ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi("No hay conexión con la biblioteca. Revisa tu internet.", 0);
  }
  const texto = await respuesta.text();
  const datos = texto ? JSON.parse(texto) : {};
  if (!respuesta.ok) throw new ErrorApi(datos.error ?? `Error ${respuesta.status}`, respuesta.status, datos.motivos ?? []);
  return datos as T;
}

export async function iniciarSesion(identificador: string, contrasena: string): Promise<Sesion> {
  const r = await pedir<{ sesion: Sesion; token: string }>("/api/auth/sesion", "POST", { identificador, contrasena });
  token = r.token;
  await SecureStore.setItemAsync(CLAVE_TOKEN, r.token);
  return r.sesion;
}

export async function sesionActual(): Promise<Sesion | null> {
  if (!(await cargarToken())) return null;
  return (await pedir<{ sesion: Sesion | null }>("/api/auth/sesion")).sesion;
}

export async function cerrarSesion(): Promise<void> {
  token = null;
  await SecureStore.deleteItemAsync(CLAVE_TOKEN);
}

export type Ubicacion = { piso: string | null; area: string | null; pasillo: string | null; estante: string | null; disponibles?: number };
export type Libro = { id: number; titulo: string; autores: string; tema: string; editorial?: string; isbn: string; tipoUso: string; existencia: number; disponibles: number; ubicaciones: Ubicacion[]; proximaDevolucion?: string | null };

/** "Piso 2 · Tecnología · pasillo A · estante 14 (1 disponible)" o el aviso de HU1-SP2, escenario 5. */
export const textoUbicacion = (u: Ubicacion) =>
  u.piso ? `${u.piso} · ${u.area} · pasillo ${u.pasillo} · estante ${u.estante}${u.disponibles !== undefined ? ` (${u.disponibles} disponible${u.disponibles === 1 ? "" : "s"})` : ""}` : "Ubicación no disponible: pregunta en el mostrador";
export const fechaCorta = (valor: string) => new Date(`${valor.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

export const buscarLibros = (q: string, soloDisponibles: boolean) =>
  pedir<Libro[]>(`/api/busqueda?q=${encodeURIComponent(q)}${soloDisponibles ? "&soloDisponibles=true" : ""}`);

export const preguntarChatbot = (texto: string) => pedir<{ respuesta: string }>("/api/chatbot/mensajes", "POST", { texto });
