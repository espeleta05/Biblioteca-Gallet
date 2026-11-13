/**
 * Reglas 3 y 4 y suspensión por exceso de multas o robo (SWEBOK 05: valores
 * límite y tablas de decisión; Google cap. 10: mensajes de error descriptivos).
 */
import {
  cargosPorDevolucion,
  costoReposicion,
  excedeMultas,
  motivoSuspensionAutomatica,
  multaPorRetraso,
  redondearPesos,
} from "../../comun/dominio/multas";

describe("Regla 3 · multa por retraso ($10 por día)", () => {
  test.each([
    ["TC-M01", "2026-11-20", "2026-11-20", 0],
    ["TC-M02", "2026-11-20", "2026-11-21", 10],
    ["TC-M03", "2026-11-20", "2026-11-23", 30],
    ["TC-M04", "2026-11-20", "2026-11-19", 0],
  ])("%s vence %s, entrega %s → $%i", (_id, vence, entrega, monto) => {
    expect(multaPorRetraso(vence, entrega)).toBe(monto);
  });
});

describe("Regla 4 · costo de reposición (USD × tipo de cambio)", () => {
  test("TC-C01 nominal: 45.50 USD × 18.2345 = 829.67 MXN", () => {
    expect(costoReposicion(45.5, 18.2345)).toBe(829.67);
  });
  test("TC-C02 precio 0 USD (donación) → 0 MXN", () => {
    expect(costoReposicion(0, 18)).toBe(0);
  });
  test.each([
    ["TC-C03", -1, 18, /Precio de compra inválido \(-1 USD\)/],
    ["TC-C04", 10, 0, /Tipo de cambio inválido \(0 MXN\/USD\)/],
    ["TC-C05", Number.NaN, 18, /Precio de compra inválido/],
  ])("%s entradas inválidas → error descriptivo", (_id, precio, tipoCambio, mensaje) => {
    expect(() => costoReposicion(precio, tipoCambio)).toThrow(mensaje);
  });
  test("redondea a centavos sin errores de punto flotante", () => {
    expect(redondearPesos(1.005)).toBe(1.01);
  });
});

describe("Devolución · tabla de decisión de cargos", () => {
  const base = { vencimiento: "2026-11-20", precioUltimaCompraUsd: 20, tipoCambioMxnPorUsd: 18 };
  test.each([
    ["CP1 a tiempo, buen estado", "2026-11-20", "Buen estado", []],
    ["CP2 tarde, buen estado", "2026-11-22", "Buen estado", [{ motivo: "Retraso", montoMxn: 20 }]],
    ["CP3 a tiempo, dañado", "2026-11-20", "Dañado", [{ motivo: "Daño", montoMxn: 360 }]],
    ["CP4 tarde, perdido", "2026-11-21", "Perdido", [{ motivo: "Retraso", montoMxn: 10 }, { motivo: "Pérdida", montoMxn: 360 }]],
    ["CP5 a tiempo, robado", "2026-11-19", "Robado", [{ motivo: "Robo", montoMxn: 360 }]],
  ] as const)("%s", (_id, fechaReporte, condicion, esperado) => {
    expect(cargosPorDevolucion({ ...base, fechaReporte, condicion })).toEqual(esperado);
  });

  test("libro dañado sin precio en dólares → error que explica qué falta", () => {
    expect(() => cargosPorDevolucion({ ...base, precioUltimaCompraUsd: null, fechaReporte: "2026-11-20", condicion: "Dañado" })).toThrow(/no tiene precio de compra en dólares/);
  });
});

describe("Alumnos suspendidos", () => {
  test.each([
    ["TC-S01", 2, false, "umbral − 1"],
    ["TC-S02", 3, true, "umbral (on)"],
    ["TC-S03", 4, true, "umbral + 1"],
  ])("%s %i multas pendientes → excede=%s (%s)", (_id, pendientes, excede) => {
    expect(excedeMultas(pendientes)).toBe(excede);
  });

  test.each([
    ["robo con 0 multas", { multasPendientes: 0, motivoNuevaMulta: "Robo" as const }, "Robo de libro"],
    ["daño con 1 multa (mal uso lo decide el personal)", { multasPendientes: 1, motivoNuevaMulta: "Daño" as const }, null],
    ["retraso que lleva a 3 multas", { multasPendientes: 3, motivoNuevaMulta: "Retraso" as const }, "Exceso de multas (3 pendientes)"],
    ["sin multa nueva y pocas multas", { multasPendientes: 1 }, null],
  ])("%s", (_caso, params, esperado) => {
    expect(motivoSuspensionAutomatica(params)).toBe(esperado);
  });
});
