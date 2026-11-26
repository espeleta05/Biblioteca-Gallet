/**
 * Agente del chatbot con Llama (ADR 0003). Se prueba con un modelo simulado:
 * el ciclo con la herramienta de búsqueda, cuándo se ofrece, la privacidad (el
 * contexto solo lleva los datos de quien pregunta) y el respaldo sin modelo.
 */
import { contextoPersona, ejecutarAgente, esLlamadaEnTexto, HERRAMIENTAS, instrucciones, llamadasEnTexto, necesitaBuscarLibros, politicaRelacionada, redactarBusqueda, SIN_ESA_HERRAMIENTA, type Herramientas, type LibroEncontrado, type Modelo } from "../../comun/dominio/agente";
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

  test("si el modelo inventa una herramienta y la escribe como texto, nunca se muestra: se le pide responder con texto", async () => {
    const { modelo, recibidos } = modeloSimulado([
      { role: "assistant", content: '{"name":"costos_de_reposicion","parameters":{}}' },
      { role: "assistant", content: "Se cobra el precio de la última compra en dólares por el tipo de cambio de Banxico." },
    ]);
    const r = await ejecutarAgente("cuanto se cobra si un libro se pierda", ["fijo"], modelo, busquedaSimulada().herramientas, { conHerramientas: true });
    expect(r).toEqual({ respuesta: "Se cobra el precio de la última compra en dólares por el tipo de cambio de Banxico.", herramientas: [] });
    expect(recibidos[1].mensajes.at(-1)).toEqual({ role: "user", content: SIN_ESA_HERRAMIENTA });
    expect(recibidos[1].herramientas).toEqual([]);
  });

  test("si insiste en escribir una herramienta inventada → null (responde el clasificador), nunca el JSON", async () => {
    const json = { role: "assistant" as const, content: '{"name":"costos_de_reposicion","parameters":{}}' };
    expect(await ejecutarAgente("x", ["fijo"], modeloSimulado([json, json, json]).modelo, busquedaSimulada().herramientas, { conHerramientas: false })).toBeNull();
    expect(esLlamadaEnTexto('{"name": "x"')).toBe(true);
    expect(esLlamadaEnTexto("La multa es de $10.")).toBe(false);
  });

  test("sin modelo (Ollama apagado) o sin respuesta final → null y el servicio usa el clasificador local", async () => {
    expect(await ejecutarAgente("hola", ["fijo"], modeloSimulado([null]).modelo, busquedaSimulada().herramientas, { conHerramientas: false })).toBeNull();
    const enCiclo = modeloSimulado(Array.from({ length: 5 }, () => llamadaBusqueda({ texto: "x" })));
    expect(await ejecutarAgente("hola", ["fijo"], enCiclo.modelo, busquedaSimulada().herramientas, { conHerramientas: true, pasos: 2 })).toBeNull();
  });
});

describe("respuesta de una búsqueda (la redacta el sistema, no el modelo)", () => {
  test("si la herramienta trae respuestaDirecta, se entrega tal cual y sin otra vuelta del modelo", async () => {
    const { modelo, recibidos } = modeloSimulado([llamadaBusqueda({ texto: "Cervantes" }), { role: "assistant", content: "¿Cuál deseas prestar?" }]);
    const herramientas: Herramientas = { buscar_libros: async () => ({ respuestaDirecta: "\"Don Quijote de la Mancha\": 2 copias disponibles." }) };
    const r = await ejecutarAgente("¿Hay algo de Cervantes?", ["fijo"], modelo, herramientas, { conHerramientas: true });
    expect(r).toEqual({ respuesta: "\"Don Quijote de la Mancha\": 2 copias disponibles.", herramientas: ["buscar_libros"] });
    expect(recibidos).toHaveLength(1);
  });

  const quijote: LibroEncontrado = { titulo: "Don Quijote de la Mancha", autores: "Miguel de Cervantes", tipoUso: "Préstamo externo", disponibles: 2, ubicaciones: ["Piso 1, área Literatura, pasillo L, estante 08"], proximaDevolucion: null };
  test.each<[string, LibroEncontrado[], string | RegExp]>([
    ["con copias", [quijote], "\"Don Quijote de la Mancha\" (Miguel de Cervantes): 2 copias disponibles en Piso 1, área Literatura, pasillo L, estante 08."],
    ["sin copias, con la devolución más próxima", [{ ...quijote, disponibles: 0, ubicaciones: [], proximaDevolucion: "2026-11-18" }],
      "\"Don Quijote de la Mancha\" (Miguel de Cervantes): sin copias disponibles; la devolución más próxima es el 2026-11-18."],
    ["de consulta interna", [{ ...quijote, disponibles: 1, tipoUso: "Consulta interna" }], /1 copia disponible en .* Su tipo de uso es "Consulta interna": no se presta fuera de la Biblioteca\./],
    ["sin resultados", [], "No encontré libros con \"Cervantes\". Prueba con otro título, autor o tema, o pregunta en el mostrador."],
  ])("%s", (_caso, libros, esperado) => {
    const texto = redactarBusqueda("Cervantes", libros);
    if (typeof esperado === "string") expect(texto).toBe(esperado); else expect(texto).toMatch(esperado);
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
    ["cuanto se cobra si un libro se pierda", false],
    ["¿Qué pasa si daño un libro?", false],
    ["¿Hay algo de Cervantes?", true],
    ["Busco un libro sobre algoritmos", true],
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

  test("la web y la app no hacen trámites (evita que el modelo diga que se puede renovar desde la app)", () => {
    expect(instrucciones([])).toMatch(/Ni la web ni la app móvil permiten prestar, renovar, devolver ni pagar/);
  });

  test("la política relacionada se le da al modelo con su texto exacto", () => {
    expect(politicaRelacionada({ id: 4, tema: "Costos de reposición", palabrasClave: "", respuesta: "Precio en USD × tipo de cambio." }))
      .toMatch(/Costos de reposición: Precio en USD × tipo de cambio\.$/);
  });

  test("el personal no tiene préstamos propios", () => {
    expect(contextoPersona({ nombre: "Mariana Torres", rol: "Bibliotecario", hoy: "2026-11-17", esPersonal: true, prestamos: [], multas: [] })).toMatch(/personal de la biblioteca/);
  });
});
