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
  | { tipo: "regla"; regla: ReglaConocimiento; puntaje: number }
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
  { intencion: "mis_vencimientos", patron: /\b(cuando|que dia|fecha)\b.*\b(vence|vencen|entrego|devuelvo|devolver|regreso)\b|\bmis vencimientos\b/ },
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
  let mejor: { regla: ReglaConocimiento; puntaje: number } | null = null;
  for (const regla of reglas) {
    const puntaje = normalizar(regla.palabrasClave).split(" ").filter((clave) => clave.length > 2 && palabras.has(clave)).length;
    if (puntaje > 0 && (!mejor || puntaje > mejor.puntaje)) mejor = { regla, puntaje };
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

export const RESPUESTA_AYUDA =
  `Soy el asistente de la biblioteca. Puedo responderte sobre vigencias, renovaciones, multas, costos de reposición y sobre tus préstamos. Por ejemplo: ${EJEMPLOS.join(" · ")}`;

export const RESPUESTA_DESCONOCIDA =
  `No entendí tu pregunta. Prueba con "${EJEMPLOS[0]}" o "${EJEMPLOS[5]}", o escribe "ayuda" para ver todo lo que puedo responder.`;
