/**
 * Regla 1 (préstamo), Reglas 2 y 6 (renovación) y Reglas 5 y 6 (vigencia).
 * Diseño de casos: tabla de decisión para la Regla 1 y valores límite para los
 * máximos de ejemplares y renovaciones (SWEBOK 05). Incluye los casos límite que
 * pide la propuesta: tercer ejemplar, renovación número tres y fin de semana.
 */
import { POLITICAS_PROPUESTA } from "../../comun/dominio/politicas";
import {
  calcularVencimiento,
  calcularVencimientoRenovado,
  estadoTrasDevolucion,
  evaluarPrestamo,
  evaluarRenovacion,
  type LibroSolicitado,
  type Solicitante,
} from "../../comun/dominio/prestamos";

const HOY = "2026-11-18";
const alumno = POLITICAS_PROPUESTA.Alumno;
const profesor = POLITICAS_PROPUESTA.Profesor;

const solicitanteValido = (cambios: Partial<Solicitante> = {}): Solicitante => ({
  activo: true,
  suspendido: false,
  multasPendientes: 0,
  prestamosActivos: 0,
  vencimientosActivos: [],
  politica: alumno,
  ...cambios,
});
const libroValido = (cambios: Partial<LibroSolicitado> = {}): LibroSolicitado => ({
  tipoUso: "Préstamo externo",
  ejemplaresDisponibles: 1,
  ...cambios,
});

describe("Regla 1 · tabla de decisión del préstamo", () => {
  // Cada fila es una columna de la tabla de decisión: solo una condición falla a la vez.
  test.each([
    ["CP1", {}, {}, true, null],
    ["CP2", { multasPendientes: 1 }, {}, false, /debe 1 multa/],
    ["CP3", { prestamosActivos: 2, vencimientosActivos: ["2026-11-20", "2026-11-20"] }, {}, false, /máximo es 2/],
    ["CP4", { prestamosActivos: 1, vencimientosActivos: ["2026-11-17"] }, {}, false, /1 préstamo\(s\) vencido/],
    ["CP5", {}, { tipoUso: "Consulta interna" }, false, /"Consulta interna" y no se presta/],
    ["CP6", {}, { tipoUso: "Reservado" }, false, /"Reservado"/],
    ["CP7", {}, { ejemplaresDisponibles: 0 }, false, /No hay ejemplares disponibles/],
    ["CP8", { suspendido: true }, {}, false, /suspendido/],
    ["CP9", { activo: false }, {}, false, /no está activa/],
  ] as Array<[string, Partial<Solicitante>, Partial<LibroSolicitado>, boolean, RegExp | null]>)("%s", (_id, cambiosSolicitante, cambiosLibro, permitido, motivo) => {
    const decision = evaluarPrestamo(solicitanteValido(cambiosSolicitante), libroValido(cambiosLibro), HOY);
    expect(decision.permitido).toBe(permitido);
    if (!decision.permitido && motivo) expect(decision.motivos.join(" ")).toMatch(motivo);
  });

  test("reporta todos los motivos a la vez, no solo el primero", () => {
    const decision = evaluarPrestamo(
      solicitanteValido({ multasPendientes: 2, prestamosActivos: 2, vencimientosActivos: ["2026-11-01", "2026-11-20"] }),
      libroValido({ ejemplaresDisponibles: 0 }),
      HOY,
    );
    expect(decision).toEqual({ permitido: false, motivos: expect.arrayContaining([expect.stringMatching(/multa/), expect.stringMatching(/máximo/), expect.stringMatching(/vencido/), expect.stringMatching(/disponibles/)]) });
    if (!decision.permitido) expect(decision.motivos).toHaveLength(4);
  });
});

describe("Regla 1 · valores límite de ejemplares prestados (máximo 2)", () => {
  test.each([
    ["TC-E01", 0, true, "nominal"],
    ["TC-E02", 1, true, "límite − 1 (in)"],
    ["TC-E03", 2, false, "límite (on): pedir el tercer ejemplar se rechaza"],
    ["TC-E04", 3, false, "límite + 1 (off)"],
  ])("%s %i activos → permitido=%s (%s)", (_id, activos, permitido) => {
    const vencimientos = Array.from({ length: activos }, () => "2026-11-25");
    expect(evaluarPrestamo(solicitanteValido({ prestamosActivos: activos, vencimientosActivos: vencimientos }), libroValido(), HOY).permitido).toBe(permitido);
  });

  test("TC-E05 un préstamo que vence hoy no cuenta como vencido", () => {
    expect(evaluarPrestamo(solicitanteValido({ prestamosActivos: 1, vencimientosActivos: [HOY] }), libroValido(), HOY).permitido).toBe(true);
  });
});

describe("Reglas 5 y 6 · vencimiento del préstamo", () => {
  test("TC-V01 alumno: 5 días hábiles desde el miércoles 18 vence el miércoles 25", () => {
    expect(calcularVencimiento("2026-11-18", alumno)).toBe("2026-11-25");
  });
  test("TC-V02 maestro: 10 días hábiles desde el miércoles 18 vence el miércoles 2 de diciembre", () => {
    expect(calcularVencimiento("2026-11-18", profesor)).toBe("2026-12-02");
  });
  test("TC-V03 fin de semana en el vencimiento: viernes + 5 hábiles cae en viernes, nunca sábado", () => {
    expect(calcularVencimiento("2026-11-20", alumno)).toBe("2026-11-27");
  });
});

describe("Reglas 2 y 6 · renovación", () => {
  const activo = (renovaciones: number, vencimiento = "2026-11-20") => ({ estado: "Activo" as const, vencimiento, renovacionesRealizadas: renovaciones });

  test.each([
    ["TC-RA1", alumno, 0, true, "alumno, primera renovación"],
    ["TC-RA2", alumno, 1, true, "alumno, segunda renovación (límite − 1 → in)"],
    ["TC-RA3", alumno, 2, false, "alumno, tercera renovación (on): se rechaza"],
    ["TC-RP1", profesor, 2, true, "maestro, tercera renovación permitida"],
    ["TC-RP2", profesor, 3, false, "maestro, cuarta renovación se rechaza"],
  ])("%s (%s)", (_id, politica, renovaciones, permitido) => {
    expect(evaluarRenovacion(activo(renovaciones), politica, HOY).permitido).toBe(permitido);
  });

  test("TC-RA4 no se renueva un préstamo vencido", () => {
    const decision = evaluarRenovacion(activo(0, "2026-11-17"), alumno, HOY);
    expect(decision).toEqual({ permitido: false, motivos: [expect.stringMatching(/venció el 2026-11-17/)] });
  });
  test("TC-RA5 sí se renueva el mismo día que vence", () => {
    expect(evaluarRenovacion(activo(0, HOY), alumno, HOY).permitido).toBe(true);
  });
  test("TC-RA6 no se renueva un préstamo devuelto", () => {
    expect(evaluarRenovacion({ estado: "Devuelto", vencimiento: "2026-11-20", renovacionesRealizadas: 0 }, alumno, HOY).permitido).toBe(false);
  });
  test("TC-RA7 la renovación extiende desde el vencimiento actual en días hábiles", () => {
    expect(calcularVencimientoRenovado("2026-11-20", alumno)).toBe("2026-11-27");
  });
});

describe("Devolución · estado del ejemplar", () => {
  test.each([
    ["Buen estado", "Disponible"],
    ["Dañado", "Dañado"],
    ["Perdido", "Perdido"],
    ["Robado", "Robado"],
  ] as const)("devuelto en condición %s → ejemplar %s", (condicion, estado) => {
    expect(estadoTrasDevolucion(condicion)).toBe(estado);
  });
});
