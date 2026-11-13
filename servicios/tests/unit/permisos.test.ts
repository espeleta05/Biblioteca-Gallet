/**
 * Matriz de permisos del API Gateway: una fila por función del Product Backlog
 * y rol (Propuesta 2.3, columnas "Usuarios"). Tabla de decisión rol × función.
 */
process.env.JWT_SECRET ??= "secreto-de-pruebas-sigeb-0123456789-abcdef";
import { evaluarAcceso, extraerToken, firmarToken, verificarToken, type Sesion } from "../../comun/auth";

const sesion = (rol: Sesion["rol"]): Sesion => ({ id: 1, identificador: "x", nombre: "x", rol });
const PERSONAL = ["Administrador", "Bibliotecario"] as const;
const SOLICITANTES = ["Alumno", "Profesor", "Colaborador"] as const;

describe("evaluarAcceso · tabla rol × función", () => {
  const casos: Array<[string, Sesion["rol"], boolean]> = [
    ...PERSONAL.flatMap((rol) => ["/api/libros", "/api/prestamos", "/api/devoluciones", "/api/multas/1/pagos", "/api/adeudos", "/api/suspensiones", "/api/lista-espera"].map((ruta): [string, Sesion["rol"], boolean] => [ruta, rol, true])),
    ...SOLICITANTES.flatMap((rol) => ["/api/libros", "/api/prestamos", "/api/devoluciones", "/api/multas", "/api/suspensiones", "/api/usuarios"].map((ruta): [string, Sesion["rol"], boolean] => [ruta, rol, false])),
    ...[...PERSONAL, ...SOLICITANTES].flatMap((rol) => [["/api/busqueda?q=x", rol, true], ["/api/chatbot/mensajes", rol, true]] as Array<[string, Sesion["rol"], boolean]>),
    ["/api/usuarios", "Administrador", true],
    ["/api/usuarios/sincronizacion", "Bibliotecario", false],
  ];
  test.each(casos)("%s como %s → permitido=%s", (ruta, rol, permitido) => {
    expect(evaluarAcceso(ruta, sesion(rol)).permitido).toBe(permitido);
  });

  test("sin sesión: 401 salvo iniciar sesión y salud", () => {
    expect(evaluarAcceso("/api/busqueda", null)).toEqual({ permitido: false, estado: 401, mensaje: "Debes iniciar sesión." });
    expect(evaluarAcceso("/api/auth/sesion", null).permitido).toBe(true);
    expect(evaluarAcceso("/salud", null).permitido).toBe(true);
  });

  test("un prefijo parecido no da acceso (/api/librosX no es /api/libros)", () => {
    expect(evaluarAcceso("/api/librosX", sesion("Bibliotecario"))).toMatchObject({ permitido: false, estado: 403 });
  });

  test("el mensaje de rechazo nombra la función del backlog", () => {
    expect(evaluarAcceso("/api/prestamos", sesion("Alumno"))).toMatchObject({ estado: 403, mensaje: 'Tu rol (Alumno) no tiene acceso a "Prestar libros".' });
  });
});

describe("JWT", () => {
  test("firmar y verificar conserva la sesión", async () => {
    expect(await verificarToken(await firmarToken(sesion("Profesor")))).toEqual(sesion("Profesor"));
  });
  test("un token alterado se rechaza", async () => {
    const token = await firmarToken(sesion("Alumno"));
    expect(await verificarToken(token.slice(0, -2) + "xx")).toBeNull();
  });
  test.each([
    [{ authorization: "Bearer abc" }, undefined, "abc"],
    [{ cookie: "otra=1; sigeb_token=def" }, undefined, "def"],
    [{}, { sigeb_token: "ghi" }, "ghi"],
    [{}, undefined, undefined],
  ])("extraerToken %#", (encabezados, cookies, esperado) => {
    expect(extraerToken(encabezados, cookies)).toBe(esperado);
  });
});
