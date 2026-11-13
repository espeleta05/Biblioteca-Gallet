/** Ficha bibliográfica y estado del ejemplar (Sprint 1). Particiones de equivalencia. */
import { normalizarIsbn, validarCambioEstado } from "../../comun/dominio/libros";

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
  ] as const)("%s → %s", (actual, nuevo, esperado) => {
    const resultado = validarCambioEstado(actual, nuevo);
    if (esperado === null) expect(resultado).toBeNull();
    else expect(resultado).toMatch(esperado);
  });
});
