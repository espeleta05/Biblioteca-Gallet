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
  "Alumnos, profesores y colaboradores buscan libros con su ubicación, consultan sus préstamos y multas en \"Mi cuenta\" y usan este asistente. \"Mi cuenta\" solo muestra datos: ahí no se hace ningún trámite.",
  "Todos los trámites (préstamos, renovaciones, devoluciones y avisos de libros perdidos o dañados) se hacen en el mostrador de la Biblioteca; las multas y los costos de reposición se pagan en Tesorería.",
  "Ni la web ni la app móvil permiten prestar, renovar, devolver ni pagar: solo sirven para buscar libros, consultar tus datos y usar este asistente.",
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
    "- Para preguntas sobre reglas, usa el texto de la política que corresponda. No inventes procesos, opciones del sistema ni excepciones: si las políticas no lo dicen, sugiere preguntar en el mostrador.",
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

/**
 * ¿La pregunta busca un libro del catálogo? Solo entonces se ofrece buscar_libros.
 * Decir "libro" no basta ("¿cuánto se cobra si un libro se pierde?" es una política):
 * hace falta una intención de búsqueda.
 */
export function necesitaBuscarLibros(pregunta: string): boolean {
  const t = normalizar(pregunta);
  if (/\b(mi|mis|me lleve|tengo prestad[oa]s?|que libros tengo|tengo el libro|tengo los libros|tengo que (entregar|regresar|devolver))\b/.test(t)) return false;
  return /\b(hay|tienen|tiene la biblioteca|busco|buscar|buscando|donde esta|donde estan|donde encuentro|ubicacion|disponible|disponibles|autor|autora|autores|ejemplares de|novelas?|libros? (de|sobre|del))\b/.test(t);
}

/**
 * Cuando el clasificador encuentra una política relacionada (aunque sea con una sola
 * palabra clave), se le da al modelo para que responda con ella y no improvise.
 */
export function politicaRelacionada(regla: ReglaConocimiento): string {
  return `Política que corresponde a esta pregunta (respóndela con este texto y agrega solo lo necesario): ${regla.tema}: ${regla.respuesta}`;
}

export type LibroEncontrado = { titulo: string; autores: string | null; tipoUso: string; disponibles: number; ubicaciones: string[]; proximaDevolucion: string | null };

/**
 * Respuesta de una búsqueda, redactada con los datos reales: Llama decide qué
 * buscar y el sistema escribe el resultado, para que títulos, copias y
 * ubicaciones nunca cambien.
 */
export function redactarBusqueda(texto: string, libros: LibroEncontrado[]): string {
  if (!libros.length) return `No encontré libros con "${texto}". Prueba con otro título, autor o tema, o pregunta en el mostrador.`;
  const lineas = libros.slice(0, 3).map((l) => {
    const quien = l.autores ? ` (${l.autores})` : "";
    const uso = l.tipoUso === "Préstamo externo" ? "" : ` Su tipo de uso es "${l.tipoUso}": no se presta fuera de la Biblioteca.`;
    if (l.disponibles > 0) {
      return `"${l.titulo}"${quien}: ${l.disponibles} ${l.disponibles === 1 ? "copia disponible" : "copias disponibles"} en ${l.ubicaciones.join("; ")}.${uso}`;
    }
    return `"${l.titulo}"${quien}: sin copias disponibles${l.proximaDevolucion ? `; la devolución más próxima es el ${l.proximaDevolucion}` : ""}.${uso}`;
  });
  // La búsqueda trae hasta 5; se muestran 3 para que la respuesta sea breve.
  return (libros.length > 3 ? ["Encontré varios libros; estos son los primeros 3 (en Buscar libros puedes ver todos):", ...lineas] : lineas).join("\n");
}

/** Texto que el modelo escribió como llamada a una herramienta ({"name": …}); nunca se le muestra al usuario. */
export function esLlamadaEnTexto(contenido: string): boolean {
  const texto = contenido.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  if (!texto.startsWith("{")) return false;
  try { return typeof (JSON.parse(texto) as { name?: unknown }).name === "string"; } catch { return /^\{\s*"name"\s*:/.test(texto); }
}

/** Se le pide al modelo cuando inventa una herramienta. */
export const SIN_ESA_HERRAMIENTA = "Esa herramienta no existe. Responde con texto, en español, usando las políticas de la Biblioteca y los datos que ya tienes.";

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
  let corregido = false;
  for (let paso = 0; paso < (opciones.pasos ?? 3); paso += 1) {
    // Después de usar una herramienta ya no se ofrecen más: la siguiente vuelta es la respuesta.
    const mensaje = await modelo(mensajes, usadas.length || corregido ? [] : ofrecidas);
    if (!mensaje) return null;
    const contenido = mensaje.content ?? "";
    const llamadas = mensaje.tool_calls?.length ? mensaje.tool_calls : llamadasEnTexto(contenido);
    if (!llamadas.length) {
      // El modelo inventó una herramienta y la escribió como texto: se le pide una vez que
      // responda con texto; si insiste, responde el clasificador local (null).
      if (esLlamadaEnTexto(contenido)) {
        if (corregido) return null;
        corregido = true;
        mensajes.push({ role: "assistant", content: contenido }, { role: "user", content: SIN_ESA_HERRAMIENTA });
        continue;
      }
      const respuesta = contenido.trim();
      return respuesta ? { respuesta: respuesta.slice(0, 1200), herramientas: usadas } : null;
    }
    mensajes.push({ role: "assistant", content: mensaje.content ?? "", tool_calls: llamadas });
    for (const llamada of llamadas) {
      const ejecutar = llamada.function.name === "buscar_libros" ? herramientas.buscar_libros : undefined;
      let resultado: unknown;
      try { resultado = ejecutar ? await ejecutar(argumentosDe(llamada)) : { error: `La herramienta ${llamada.function.name} no existe.` }; }
      catch (error) { resultado = { error: `No se pudo consultar: ${(error as Error).message}` }; }
      usadas.push(llamada.function.name);
      // La herramienta ya trae la respuesta redactada con los datos reales (títulos, copias y
      // ubicaciones): se entrega tal cual, sin otra vuelta del modelo que pudiera cambiarlos.
      const directa = (resultado as { respuestaDirecta?: unknown } | null)?.respuestaDirecta;
      if (typeof directa === "string" && directa) return { respuesta: directa, herramientas: usadas };
      mensajes.push({ role: "tool", tool_name: llamada.function.name, content: JSON.stringify(resultado) });
    }
  }
  return null;
}
