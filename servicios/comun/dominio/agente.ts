/**
 * Agente del chatbot con Llama (ADR 0003).
 *
 * - Los préstamos y multas de quien pregunta van en su contexto. El servicio los
 *   lee con la sesión del JWT, así que el modelo nunca ve datos de otra persona y
 *   no gasta una vuelta en pedirlos.
 * - Para buscar libros, el modelo usa la herramienta buscar_libros. Solo se le
 *   ofrece cuando la pregunta trata de libros: con un modelo de 3B en un
 *   procesador, cada vuelta extra cuesta varios segundos.
 * - Las instrucciones fijas van primero y no cambian entre preguntas, para que
 *   Ollama reutilice ese inicio ya procesado.
 *
 * Este módulo no toca la base de datos ni la red: recibe el modelo y las
 * herramientas como funciones, para poder probarlo con un modelo simulado.
 */
import type { HerramientaLlm, LlamadaHerramienta, MensajeLlm } from "../integraciones";
import { normalizar, type ReglaConocimiento } from "./chatbot";

export const HERRAMIENTAS: HerramientaLlm[] = [
  {
    type: "function",
    function: {
      name: "buscar_libros",
      description: "Busca en el catálogo por título, autor o tema. Devuelve copias disponibles, ubicación (piso, área, pasillo y estante), tipo de uso y la fecha de devolución más próxima si no hay copias.",
      parameters: { type: "object", properties: { texto: { type: "string", description: "Título, autor o tema a buscar (una o dos palabras clave)" } }, required: ["texto"] },
    },
  },
];

export type Herramientas = { buscar_libros: (argumentos: Record<string, unknown>) => Promise<unknown> };
export type Modelo = (mensajes: MensajeLlm[], herramientas: HerramientaLlm[]) => Promise<MensajeLlm | null>;

/** Información de la aplicación (HU3-SP7): objetivo, alcance y plataformas. */
export const INFORMACION_SIGEB = [
  "SIGEB (Sistema Integral de Gestión Bibliotecaria) es el sistema de la Biblioteca de la Universidad Ducky.",
  "Objetivo: automatizar préstamos, devoluciones, renovaciones, multas, catálogo e inventarios, con las mismas reglas para todos y evidencia de cada operación (ISO 9001:2015).",
  "Funciones: gestión de usuarios, gestionar libros, buscar libros, prestar libros, devolver libros, gestión de multas, alumnos suspendidos y este asistente.",
  "Alumnos, profesores y colaboradores buscan libros con su ubicación, consultan sus préstamos y multas en \"Mi cuenta\" y usan este asistente. Los préstamos, renovaciones y devoluciones se registran en el mostrador; las multas se pagan en Tesorería.",
  "Plataformas: una aplicación web que usan tanto el personal de la Biblioteca como los lectores, y una app móvil para Android e iOS (búsqueda de libros y asistente). El asistente funciona las 24 horas.",
].join("\n");

/** Instrucciones fijas del agente: rol, límites, políticas de la Biblioteca e información de SIGEB. */
export function instrucciones(reglas: ReglaConocimiento[]): string {
  return [
    "Eres el asistente virtual de la Biblioteca de la Universidad Ducky, dentro de SIGEB.",
    "- Responde en español, amable y breve: máximo 3 oraciones.",
    "- Solo ayudas con la Biblioteca y con SIGEB. Si preguntan otra cosa, responde en una sola oración que solo ayudas con la Biblioteca y sugiere una pregunta que sí puedes contestar.",
    "- Los préstamos y multas de la persona están en \"Datos de quien pregunta\". Úsalos tal cual; nunca inventes títulos, fechas ni montos.",
    "- No registras préstamos, renovaciones, devoluciones ni pagos: eso se hace en el mostrador o en Tesorería.",
    "Políticas de la Biblioteca:",
    ...reglas.map((r) => `- ${r.tema}: ${r.respuesta}`),
    "Información de SIGEB:",
    INFORMACION_SIGEB,
  ].join("\n");
}

export type DatosPersona = {
  nombre: string; rol: string; hoy: string; esPersonal: boolean;
  prestamos: Array<{ titulo: string; vence: string; vencido: boolean; renovaciones: number }>;
  multas: Array<{ motivo: string; montoMxn: number }>;
};

/** Contexto de quien pregunta: solo sus propios datos, leídos con su sesión. */
export function contextoPersona(d: DatosPersona): string {
  const lineas = [`Datos de quien pregunta: ${d.nombre} (${d.rol}). Hoy es ${d.hoy}.`];
  if (d.esPersonal) {
    lineas.push("Es personal de la biblioteca: no tiene préstamos propios; los préstamos de los lectores se consultan en Prestar y devolver.");
    return lineas.join("\n");
  }
  lineas.push(d.prestamos.length
    ? `Préstamos activos: ${d.prestamos.map((p) => p.vencido
      // Para un modelo pequeño, la consecuencia va explícita: así no inventa una fecha nueva.
      ? `"${p.titulo}": venció el ${p.vence}; ya no hay fecha límite nueva: debe devolverlo lo antes posible, no se puede renovar y suma $10 de multa por cada día de retraso`
      : `"${p.titulo}": vence el ${p.vence} (${p.renovaciones} renovación(es))`).join("; ")}.`
    : "Préstamos activos: ninguno.");
  lineas.push(d.multas.length
    ? `Multas pendientes: ${d.multas.map((m) => `${m.motivo.toLowerCase()} $${m.montoMxn.toFixed(2)}`).join("; ")} (se pagan en Tesorería).`
    : "Multas pendientes: ninguna.");
  return lineas.join("\n");
}

/** ¿La pregunta busca un libro del catálogo? Solo entonces se ofrece buscar_libros. */
export function necesitaBuscarLibros(pregunta: string): boolean {
  const t = normalizar(pregunta);
  if (/\b(mi|mis|me lleve|tengo prestad[oa]s?|que libros tengo|tengo el libro|tengo los libros|tengo que (entregar|regresar|devolver))\b/.test(t)) return false;
  return /\b(libro|libros|autor|autora|autores|tema|temas|ejemplar|ejemplares|novela|novelas|titulo|disponible|disponibles|busco|buscar|tienen|hay|donde esta|donde estan|ubicacion)\b/.test(t);
}

const NOMBRES = new Set<string>(HERRAMIENTAS.map((h) => h.function.name));

/**
 * Llama 3.2 a veces escribe la llamada a la herramienta como texto JSON en lugar
 * de usar tool_calls; se reconoce para no mostrarle ese JSON al usuario.
 */
export function llamadasEnTexto(contenido: string): LlamadaHerramienta[] {
  const texto = contenido.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  if (!texto.startsWith("{")) return [];
  try {
    const dato = JSON.parse(texto) as { name?: unknown; parameters?: unknown; arguments?: unknown };
    return typeof dato.name === "string" && NOMBRES.has(dato.name)
      ? [{ function: { name: dato.name, arguments: (dato.parameters ?? dato.arguments ?? {}) as Record<string, unknown> } }]
      : [];
  } catch {
    return [];
  }
}

const argumentosDe = (llamada: LlamadaHerramienta): Record<string, unknown> => {
  const a = llamada.function.arguments;
  if (typeof a !== "string") return a ?? {};
  try { return JSON.parse(a) as Record<string, unknown>; } catch { return {}; }
};

export type ResultadoAgente = { respuesta: string; herramientas: string[] };

/**
 * Ciclo del agente: el modelo responde o pide herramientas; se ejecutan y se le
 * devuelven los resultados hasta que responde con texto (máximo `pasos` vueltas).
 * Devuelve null si el modelo no está disponible o no llega a una respuesta.
 */
export async function ejecutarAgente(
  pregunta: string, sistema: string[], modelo: Modelo, herramientas: Herramientas, opciones: { conHerramientas: boolean; pasos?: number },
): Promise<ResultadoAgente | null> {
  const mensajes: MensajeLlm[] = [...sistema.map((content): MensajeLlm => ({ role: "system", content })), { role: "user", content: pregunta }];
  const ofrecidas = opciones.conHerramientas ? HERRAMIENTAS : [];
  const usadas: string[] = [];
  for (let paso = 0; paso < (opciones.pasos ?? 3); paso += 1) {
    // Después de usar una herramienta ya no se ofrecen más: la siguiente vuelta es la respuesta.
    const mensaje = await modelo(mensajes, usadas.length ? [] : ofrecidas);
    if (!mensaje) return null;
    const llamadas = mensaje.tool_calls?.length ? mensaje.tool_calls : llamadasEnTexto(mensaje.content ?? "");
    if (!llamadas.length) {
      const respuesta = (mensaje.content ?? "").trim();
      return respuesta ? { respuesta: respuesta.slice(0, 1200), herramientas: usadas } : null;
    }
    mensajes.push({ role: "assistant", content: mensaje.content ?? "", tool_calls: llamadas });
    for (const llamada of llamadas) {
      const ejecutar = llamada.function.name === "buscar_libros" ? herramientas.buscar_libros : undefined;
      let resultado: unknown;
      try { resultado = ejecutar ? await ejecutar(argumentosDe(llamada)) : { error: `La herramienta ${llamada.function.name} no existe.` }; }
      catch (error) { resultado = { error: `No se pudo consultar: ${(error as Error).message}` }; }
      usadas.push(llamada.function.name);
      mensajes.push({ role: "tool", tool_name: llamada.function.name, content: JSON.stringify(resultado) });
    }
  }
  return null;
}
