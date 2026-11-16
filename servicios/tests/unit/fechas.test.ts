/**
 * Reglas 5 y 6: vigencia en días hábiles. Casos diseñados con particiones de
 * equivalencia y valores límite (SWEBOK 05). Fechas de noviembre de 2026:
 * lun 16, mar 17, mié 18, jue 19, vie 20, sáb 21, dom 22, lun 23.
 */
import { diasDeRetraso, esDiaHabil, hoyEnBiblioteca, sumarDiasHabiles } from "../../comun/dominio/fechas";

describe("sumarDiasHabiles (Reglas 5 y 6)", () => {
  test.each([
    ["TC-F01", "2026-11-16", 5, "2026-11-23", "lunes + 5 hábiles salta el fin de semana"],
    ["TC-F02", "2026-11-20", 1, "2026-11-23", "viernes + 1 cae en lunes, no en sábado"],
    ["TC-F03", "2026-11-21", 1, "2026-11-23", "préstamo registrado en sábado vence el lunes"],
    ["TC-F04", "2026-11-22", 5, "2026-11-27", "domingo + 5 hábiles"],
    ["TC-F05", "2026-11-16", 10, "2026-11-30", "maestro: lunes + 10 hábiles"],
    ["TC-F06", "2026-11-16", 0, "2026-11-16", "límite inferior: 0 días no mueve la fecha"],
    ["TC-F07", "2026-12-31", 1, "2027-01-01", "cambio de año"],
  ])("%s %s + %i → %s (%s)", (_id, desde, dias, esperado) => {
    expect(sumarDiasHabiles(desde, dias)).toBe(esperado);
  });

  test("TC-F08 el vencimiento nunca cae en fin de semana (propiedad para 1..15 días desde cada día de la semana)", () => {
    for (let inicio = 16; inicio <= 22; inicio += 1) {
      for (let dias = 1; dias <= 15; dias += 1) {
        expect(esDiaHabil(sumarDiasHabiles(`2026-11-${inicio}`, dias))).toBe(true);
      }
    }
  });

  test.each([
    ["TC-F09", "2026-11-16", -1, /Días hábiles inválidos \(-1\)/],
    ["TC-F10", "2026-11-16", 1.5, /Días hábiles inválidos \(1.5\)/],
    ["TC-F11", "16/11/2026", 1, /formato AAAA-MM-DD/],
    ["TC-F12", "2026-02-30", 1, /no existe en el calendario/],
  ])("%s entrada inválida %s, %s → error descriptivo", (_id, desde, dias, mensaje) => {
    expect(() => sumarDiasHabiles(desde as string, dias as number)).toThrow(mensaje as RegExp);
  });
});

describe("diasDeRetraso (Regla 3)", () => {
  test.each([
    ["TC-R01", "2026-11-20", "2026-11-19", 0, "entrega antes del vencimiento (in)"],
    ["TC-R02", "2026-11-20", "2026-11-20", 0, "entrega el día del vencimiento (on)"],
    ["TC-R03", "2026-11-20", "2026-11-21", 1, "un día después (off)"],
    ["TC-R04", "2026-11-20", "2026-11-30", 10, "diez días naturales de retraso"],
  ])("%s vence %s, entrega %s → %i día(s) (%s)", (_id, vence, entrega, esperado) => {
    expect(diasDeRetraso(vence, entrega)).toBe(esperado);
  });
});

describe("hoyEnBiblioteca", () => {
  test("TC-H01 usa la hora de Monterrey: 2026-11-21 01:00 UTC todavía es 20 de noviembre allá", () => {
    expect(hoyEnBiblioteca(new Date("2026-11-21T01:00:00Z"))).toBe("2026-11-20");
  });
});
