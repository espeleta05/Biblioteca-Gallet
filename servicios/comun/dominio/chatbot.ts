/**
 * Clasificación de preguntas del chatbot (Sprint 4). Se usa cuando Dialogflow CX
 * no está configurado y como respaldo si no responde. Dos familias de intención:
 * reglas y políticas (base de conocimiento) y consultas personales (préstamos
 * vigentes, vencimientos y multas del usuario).
 */

export type IntencionPersonal = "mis_prestamos" | "mis_vencimientos" | "mis_multas";
export type ReglaConocimiento = { id: number; tema: string; palabrasClave: string; respuesta: string };
export type Clasificacion =
  | { tipo: "personal"; intencion: IntencionPersonal }
  | { tipo: "regla"; regla: ReglaConocimiento; puntaje: number; coincidencias: string[] }
  | { tipo: "ayuda" }
  | { tipo: "desconocida" };

/** Saludos: se quitan antes de buscar el tema ("buenos días" no es una pregunta sobre días). */
const SALUDOS = /\b(hola|buenos dias|buenas tardes|buenas noches|buenas)\b/g;
/** Preguntas sobre el propio asistente ("¿qué puedo preguntar?"). */
const AYUDA = /\b(ayuda|ayudame|que puedo preguntar|que te puedo preguntar|que puedes hacer|que sabes|que haces|como funciona|como te uso|opciones|menu)\b/;

export function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();
}

const PERSONALES: Array<{ intencion: IntencionPersonal; patron: RegExp }> = [
  { intencion: "mis_multas", patron: /\b(mis|tengo|debo|cuanto debo)\b.*\b(multa|multas|adeudo|adeudos|debo)\b|\bcuanto debo\b/ },
  // Datos personales exactos: siempre con respuesta determinista, nunca redactados por el modelo de lenguaje (ADR 0003).
  { intencion: "mis_vencimientos", patron: /\b(cuando|que dia|fecha|hasta cuando|para cuando)\b.*\b(vence|vencen|vencio|entrego|entregar|entregarlo|devuelvo|devolver|devolverlo|regreso|regresar|regresarlo|tengo el libro|tengo los libros)\b|\bmis vencimientos\b/ },
  { intencion: "mis_prestamos", patron: /\b(mis|tengo)\b.*\b(prestamo|prestamos|libros)\b|\bque libros tengo\b/ },
];

/** Puntaje = palabras clave de la regla que aparecen en la pregunta. */
export function clasificar(pregunta: string, reglas: ReglaConocimiento[]): Clasificacion {
  const completo = normalizar(pregunta);
  if (!completo) return { tipo: "desconocida" };
  const texto = completo.replace(SALUDOS, " ").replace(/\s+/g, " ").trim();
  if (!texto) return { tipo: "ayuda" }; // solo saludó
  const personal = PERSONALES.find((p) => p.patron.test(texto));
  if (personal) return { tipo: "personal", intencion: personal.intencion };
  const palabras = new Set(texto.split(" "));
  let mejor: { regla: ReglaConocimiento; puntaje: number; coincidencias: string[] } | null = null;
  for (const regla of reglas) {
    const coincidencias = normalizar(regla.palabrasClave).split(" ").filter((clave) => clave.length > 2 && palabras.has(clave));
    if (coincidencias.length > 0 && (!mejor || coincidencias.length > mejor.puntaje)) mejor = { regla, puntaje: coincidencias.length, coincidencias };
  }
  if (mejor) return { tipo: "regla", ...mejor };
  // Un saludo o una pregunta sobre el asistente solo cuando no pidió un tema concreto.
  return AYUDA.test(texto) ? { tipo: "ayuda" } : { tipo: "desconocida" };
}

const EJEMPLOS = [
  "¿Cuántos días dura un préstamo?",
  "¿Cuántas veces puedo renovar?",
  "¿Cuánto es la multa por entregar tarde?",
  "¿Cuánto pago si pierdo un libro?",
  "¿Cuántos libros puedo llevar?",
  "¿Tengo multas?",
  "¿Cuándo vence mi libro?",
  "¿Qué libros tengo?",
];

/** Una pregunta de ejemplo por línea: el chat las muestra como lista (white-space: pre-line). */
export const RESPUESTA_AYUDA = [
  "Soy el asistente de la biblioteca. Puedo responderte sobre vigencias, renovaciones, multas, costos de reposición y sobre tus préstamos. Por ejemplo:",
  ...EJEMPLOS.map((e) => `• ${e}`),
].join("\n");

/** Palabras clave demasiado generales para decidir solas que la pregunta es sobre esa política. */
const GENERALES = new Set(["dia", "dias", "tiempo", "veces", "libros", "costo", "cuantos", "pedir", "sacar", "hasta", "semana"]);

/**
 * ¿La política se puede responder tal cual, sin el modelo de lenguaje? (ADR 0003)
 * Sí con 2 o más palabras clave, o con una sola que sea específica ("pierdo",
 * "renovar", "multa"); no con una general como "día" ("¿qué día es hoy?").
 */
export function reglaSegura(c: Extract<Clasificacion, { tipo: "regla" }>): boolean {
  return c.puntaje >= 2 || c.coincidencias.some((p) => !GENERALES.has(p));
}

export const RESPUESTA_DESCONOCIDA =
  `No entendí tu pregunta. Prueba con "${EJEMPLOS[0]}" o "${EJEMPLOS[5]}", o escribe "ayuda" para ver todo lo que puedo responder.`;
