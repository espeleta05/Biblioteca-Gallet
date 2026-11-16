/** Clasificación de preguntas del chatbot: tabla de casos por intención. */
import { clasificar, normalizar, type ReglaConocimiento } from "../../comun/dominio/chatbot";

const reglas: ReglaConocimiento[] = [
  { id: 1, tema: "Vigencias", palabrasClave: "cuantos dias dura vigencia plazo prestamo vence tiempo", respuesta: "5 o 10 días hábiles" },
  { id: 2, tema: "Renovaciones", palabrasClave: "renovar renovacion renuevo extender ampliar", respuesta: "2 o 3 renovaciones" },
  { id: 3, tema: "Multas", palabrasClave: "multa retraso tarde atraso cobro pagar costo dia", respuesta: "$10 por día" },
  { id: 4, tema: "Costos de reposición", palabrasClave: "perdi pierdo perdida daño dañe robo reponer reposicion", respuesta: "USD × tipo de cambio" },
];

test("normalizar quita acentos, signos y mayúsculas", () => {
  expect(normalizar("¿Cuántos DÍAS dura?")).toBe("cuantos dias dura");
});

describe("clasificar", () => {
  test.each([
    ["¿Cuántos días dura un préstamo?", "regla", "Vigencias"],
    ["¿Puedo renovar mi libro?", "regla", "Renovaciones"],
    ["¿De cuánto es la multa si entrego tarde?", "regla", "Multas"],
    ["Perdí un libro, ¿cuánto pago?", "regla", "Costos de reposición"],
    ["¿Tengo multas?", "personal", "mis_multas"],
    ["¿Cuánto debo?", "personal", "mis_multas"],
    ["¿Cuándo vence mi libro?", "personal", "mis_vencimientos"],
    ["¿Qué libros tengo?", "personal", "mis_prestamos"],
    ["mis préstamos", "personal", "mis_prestamos"],
  ])("%s → %s %s", (pregunta, tipo, esperado) => {
    const r = clasificar(pregunta, reglas);
    expect(r.tipo).toBe(tipo);
    if (r.tipo === "regla") expect(r.regla.tema).toBe(esperado);
    if (r.tipo === "personal") expect(r.intencion).toBe(esperado);
  });

  test.each(["", "   ", "¿Cuál es la capital de Francia?"])("pregunta fuera de dominio %p → desconocida", (pregunta) => {
    expect(clasificar(pregunta, reglas).tipo).toBe("desconocida");
  });
});
