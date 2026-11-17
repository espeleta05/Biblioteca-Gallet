/**
 * Agente del chatbot con Llama (ADR 0003). Se prueba con un modelo simulado:
 * el ciclo con la herramienta de búsqueda, cuándo se ofrece, la privacidad (el
 * contexto solo lleva los datos de quien pregunta) y el respaldo sin modelo.
 */
import { contextoPersona, ejecutarAgente, HERRAMIENTAS, instrucciones, llamadasEnTexto, necesitaBuscarLibros, type Herramientas, type Modelo } from "../../comun/dominio/agente";
import type { HerramientaLlm, MensajeLlm } from "../../comun/integraciones";

/** Modelo simulado: devuelve en orden las respuestas preparadas y guarda lo que recibió. */
function modeloSimulado(respuestas: Array<MensajeLlm | null>) {
  const recibidos: Array<{ mensajes: MensajeLlm[]; herramientas: HerramientaLlm[] }> = [];
  const modelo: Modelo = async (mensajes, herramientas) => { recibidos.push({ mensajes: structuredClone(mensajes), herramientas }); return respuestas.shift() ?? null; };
  return { modelo, recibidos };
}

function busquedaSimulada(resultado: unknown = { libros: [{ titulo: "Clean Code", disponibles: 0, proximaDevolucion: "2026-11-18" }] }) {
  const llamadas: Array<Record<string, unknown>> = [];
  const herramientas: Herramientas = { buscar_libros: async (argumentos) => { llamadas.push(argumentos); return resultado; } };
  return { herramientas, llamadas };
}

const llamadaBusqueda = (argumentos: Record<string, unknown> | string): MensajeLlm =>
  ({ role: "assistant", content: "", tool_calls: [{ function: { name: "buscar_libros", arguments: argumentos } }] });

describe("agente del chatbot (Llama)", () => {
  test("responde directo cuando no necesita herramientas, y sin ofrecerlas", async () => {
    const { modelo, recibidos } = modeloSimulado([{ role: "assistant", content: "SIGEB es el sistema de la Biblioteca." }]);
    const r = await ejecutarAgente("¿Para qué sirve SIGEB?", ["fijo", "persona"], modelo, busquedaSimulada().herramientas, { conHerramientas: false });
    expect(r).toEqual({ respuesta: "SIGEB es el sistema de la Biblioteca.", herramientas: [] });
    expect(recibidos[0].herramientas).toEqual([]);
    expect(recibidos[0].mensajes.map((m) => m.role)).toEqual(["system", "system", "user"]);
  });

  test("busca un libro: pide la herramienta, recibe el resultado y redacta la respuesta", async () => {
    const { modelo, recibidos } = modeloSimulado([llamadaBusqueda({ texto: "clean code" }), { role: "assistant", content: "Clean Code no tiene copias; regresa el 18 de noviembre." }]);
    const { herramientas, llamadas } = busquedaSimulada();
    const r = await ejecutarAgente("¿Hay Clean Code?", ["fijo"], modelo, herramientas, { conHerramientas: true });
    expect(r).toEqual({ respuesta: "Clean Code no tiene copias; regresa el 18 de noviembre.", herramientas: ["buscar_libros"] });
    expect(llamadas).toEqual([{ texto: "clean code" }]);
    expect(recibidos[0].herramientas).toBe(HERRAMIENTAS);
    // La segunda vuelta lleva el resultado con rol "tool" y ya no ofrece herramientas (una sola búsqueda).
    expect(recibidos[1].mensajes.at(-1)).toMatchObject({ role: "tool", tool_name: "buscar_libros" });
    expect(recibidos[1].herramientas).toEqual([]);
  });

  test("argumentos como texto JSON y llamadas escritas en el contenido (Llama 3.2)", async () => {
    const { modelo } = modeloSimulado([llamadaBusqueda('{"texto":"java"}'), { role: "assistant", content: "Hay Effective Java en el piso 2." }]);
    const { herramientas, llamadas } = busquedaSimulada();
    await ejecutarAgente("¿Hay libros de java?", ["fijo"], modelo, herramientas, { conHerramientas: true });
    expect(llamadas).toEqual([{ texto: "java" }]);
    expect(llamadasEnTexto('{"name": "buscar_libros", "parameters": {"texto": "java"}}')).toEqual([{ function: { name: "buscar_libros", arguments: { texto: "java" } } }]);
    expect(llamadasEnTexto("```json\n{\"name\": \"buscar_libros\", \"parameters\": {}}\n```")).toHaveLength(1);
    expect(llamadasEnTexto('{"name": "borrar_base", "parameters": {}}')).toEqual([]);
    expect(llamadasEnTexto("Hola, ¿en qué te ayudo?")).toEqual([]);
  });

  test("una herramienta que no existe o que falla se le explica al modelo en lugar de romper el chat", async () => {
    const { modelo, recibidos } = modeloSimulado([
      { role: "assistant", content: "", tool_calls: [{ function: { name: "consultar_multas_de", arguments: { id: 99 } } }] },
      { role: "assistant", content: "Solo puedo darte tus propios datos." },
    ]);
    await ejecutarAgente("¿Cuánto debe ALU099?", ["fijo"], modelo, busquedaSimulada().herramientas, { conHerramientas: true });
    expect(recibidos[1].mensajes.at(-1)!.content).toMatch(/no existe/);
    const falla = modeloSimulado([llamadaBusqueda({ texto: "java" }), { role: "assistant", content: "No pude consultar el catálogo." }]);
    const r = await ejecutarAgente("¿Hay java?", ["fijo"], falla.modelo, { buscar_libros: async () => { throw new Error("base de datos no disponible"); } }, { conHerramientas: true });
    expect(r?.respuesta).toBe("No pude consultar el catálogo.");
    expect(falla.recibidos[1].mensajes.at(-1)!.content).toMatch(/No se pudo consultar: base de datos no disponible/);
  });

  test("sin modelo (Ollama apagado) o sin respuesta final → null y el servicio usa el clasificador local", async () => {
    expect(await ejecutarAgente("hola", ["fijo"], modeloSimulado([null]).modelo, busquedaSimulada().herramientas, { conHerramientas: false })).toBeNull();
    const enCiclo = modeloSimulado(Array.from({ length: 5 }, () => llamadaBusqueda({ texto: "x" })));
    expect(await ejecutarAgente("hola", ["fijo"], enCiclo.modelo, busquedaSimulada().herramientas, { conHerramientas: true, pasos: 2 })).toBeNull();
  });
});

describe("cuándo se ofrece la búsqueda de libros", () => {
  test.each([
    ["¿Hay libros de java disponibles?", true],
    ["¿Dónde está Clean Code?", true],
    ["¿Qué libros tienen de Cervantes?", true],
    ["¿Cuándo tengo que regresar mi libro?", false],
    ["¿Qué libros tengo prestados?", false],
    ["¿Para qué sirve SIGEB?", false],
    ["¿Cuál es la capital de Francia?", false],
  ])("%s → %s", (pregunta, esperado) => expect(necesitaBuscarLibros(pregunta)).toBe(esperado));
});

describe("instrucciones y contexto", () => {
  test("las instrucciones fijas llevan las políticas y la información de SIGEB (HU3-SP7), sin datos personales", () => {
    const texto = instrucciones([{ id: 1, tema: "Multas", palabrasClave: "", respuesta: "La multa es de $10 por día." }]);
    expect(texto).toContain("Multas: La multa es de $10 por día.");
    expect(texto).toMatch(/Plataformas: una aplicación web .* app móvil para Android e iOS/);
    expect(texto).toMatch(/Objetivo: automatizar/);
    expect(texto).not.toMatch(/Hoy es/);
  });

  test("privacidad: el contexto solo lleva los préstamos y multas de quien pregunta", () => {
    const texto = contextoPersona({ nombre: "Alumno ALU005", rol: "Alumno", hoy: "2026-11-17", esPersonal: false,
      prestamos: [{ titulo: "Effective Java", vence: "2026-11-14", vencido: true, renovaciones: 0 }], multas: [{ motivo: "Retraso", montoMxn: 30 }] });
    expect(texto).toContain("Alumno ALU005 (Alumno). Hoy es 2026-11-17.");
    expect(texto).toContain('"Effective Java": venció el 2026-11-14; ya no hay fecha límite nueva');
    expect(texto).toContain("retraso $30.00");
  });

  test("el personal no tiene préstamos propios", () => {
    expect(contextoPersona({ nombre: "Mariana Torres", rol: "Bibliotecario", hoy: "2026-11-17", esPersonal: true, prestamos: [], multas: [] })).toMatch(/personal de la biblioteca/);
  });
});
