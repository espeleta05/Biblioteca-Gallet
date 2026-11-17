/** Ficha bibliográfica y estado del ejemplar (Sprint 1). Particiones de equivalencia. */
import { claveLibro, estadoRecepcion, excesoPresupuesto, idDeClaveLibro, normalizarIsbn, precioUsdDeCompra, validarBajaEjemplar, validarCambioEstado } from "../../comun/dominio/libros";

describe("normalizarIsbn", () => {
  test.each([
    ["TC-I01", "9780134685991", "9780134685991", "ISBN-13 válido"],
    ["TC-I02", "978-0-13-468599-1", "9780134685991", "con guiones"],
    ["TC-I03", "0306406152", "0306406152", "ISBN-10 válido"],
    ["TC-I04", "080442957X", "080442957X", "ISBN-10 con X"],
    ["TC-I05", "9780134685992", null, "dígito verificador incorrecto"],
    ["TC-I06", "978013468599", null, "12 dígitos"],
    ["TC-I07", "97801346859911", null, "14 dígitos"],
    ["TC-I08", "ABCDEFGHIJ", null, "no numérico"],
  ])("%s %s → %s (%s)", (_id, entrada, esperado, _caso) => {
    expect(normalizarIsbn(entrada)).toBe(esperado);
  });
});

describe("validarCambioEstado", () => {
  test.each([
    ["Disponible", "Perdido", null],
    ["Dañado", "Disponible", null],
    ["Prestado", "Disponible", /registrar la devolución/],
    ["Disponible", "Prestado", /solo al registrar un préstamo/],
    ["Robado", "Robado", null],
    ["Dado de baja", "Disponible", /dado de baja/],
    ["Disponible", "Dado de baja", /Baja de libros/],
  ] as const)("%s → %s", (actual, nuevo, esperado) => {
    const resultado = validarCambioEstado(actual, nuevo);
    if (esperado === null) expect(resultado).toBeNull();
    else expect(resultado).toMatch(esperado);
  });
});

describe("HU1-SP1 · clave del libro", () => {
  test("se genera LIB-0001", () => expect(claveLibro(1)).toBe("LIB-0001"));
  test.each([
    ["LIB-0007", 7], ["lib7", 7], ["27", 27], ["9780134685991", null], ["ABC", null],
  ] as const)("idDeClaveLibro(%s) → %s", (dato, id) => expect(idDeClaveLibro(dato)).toBe(id));
});

describe("HU2-SP1 · baja de ejemplares (tabla de decisión)", () => {
  test.each([
    ["Disponible", false, "Obsoleto", null],
    ["Dañado", false, "Dañado", null],
    ["Disponible", false, undefined, "Selecciona el motivo de la baja."],
    ["Prestado", false, "Perdido", "No se puede dar de baja un ejemplar prestado o reservado."],
    ["Disponible", true, "Obsoleto", "No se puede dar de baja un ejemplar prestado o reservado."],
    ["Dado de baja", false, "Obsoleto", "El ejemplar ya está dado de baja."],
  ] as const)("%s, reservado=%s, motivo=%s → %s", (estado, reservado, motivo, esperado) => {
    expect(validarBajaEjemplar(estado, reservado, motivo)).toBe(esperado);
  });
});

describe("HU5-SP1 · compra de libros", () => {
  test.each([
    [20000, 19999.99, 0], [20000, 20000, 0], [20000, 27000, 7000], [0, 150.5, 150.5],
  ])("disponible %d, total %d → excede por %d", (disponible, total, exceso) => expect(excesoPresupuesto(disponible, total)).toBe(exceso));
  test("recepción completa → Recibida", () => expect(estadoRecepcion([{ cantidad: 3, recibida: 3 }, { cantidad: 2, recibida: 2 }])).toEqual({ faltan: 0, estatus: "Recibida" }));
  test("recepción incompleta → Recibida parcialmente y cuántos faltan", () => expect(estadoRecepcion([{ cantidad: 3, recibida: 1 }, { cantidad: 2, recibida: 2 }])).toEqual({ faltan: 2, estatus: "Recibida parcialmente" }));
  test("el precio de compra en pesos se guarda en dólares para la Regla 4", () => expect(precioUsdDeCompra(1100, 18.25)).toBe(60.27));
});
