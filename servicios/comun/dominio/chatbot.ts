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
  | { tipo: "desconocida" };

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
  const texto = normalizar(pregunta);
  if (!texto) return { tipo: "desconocida" };
  const personal = PERSONALES.find((p) => p.patron.test(texto));
  if (personal) return { tipo: "personal", intencion: personal.intencion };
  const palabras = new Set(texto.split(" "));
  let mejor: { regla: ReglaConocimiento; puntaje: number } | null = null;
  for (const regla of reglas) {
    const puntaje = normalizar(regla.palabrasClave).split(" ").filter((clave) => clave.length > 2 && palabras.has(clave)).length;
    if (puntaje > 0 && (!mejor || puntaje > mejor.puntaje)) mejor = { regla, puntaje };
  }
  return mejor ? { tipo: "regla", ...mejor } : { tipo: "desconocida" };
}

export const RESPUESTA_DESCONOCIDA =
  "No entendí tu pregunta. Puedo ayudarte con vigencias, renovaciones, multas, costos de reposición y con tus préstamos vigentes, vencimientos y multas.";
