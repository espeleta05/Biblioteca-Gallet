/**
 * Matriz de permisos del API Gateway: una fila por función del Product Backlog
 * y rol (Propuesta 2.3, columnas "Usuarios"). Tabla de decisión rol × función.
 */
process.env.JWT_SECRET ??= "secreto-de-pruebas-sigeb-0123456789-abcdef";
import { evaluarAcceso, extraerToken, firmarToken, jsonAscii, PERFILES_BASE, permisosDe, verificarToken, type Sesion } from "../../comun/auth";

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

  test("HU1-SP0 esc. 5: una función fuera del perfil → \"No tienes permisos para acceder a esta función.\"", () => {
    expect(evaluarAcceso("/api/libros", sesion("Alumno"), "POST")).toMatchObject({ estado: 403, mensaje: "No tienes permisos para acceder a esta función." });
  });

  test("HU2-SP0 esc. 4: el bibliotecario que intenta dar de alta cuentas", () => {
    expect(evaluarAcceso("/api/usuarios", sesion("Bibliotecario"), "POST")).toMatchObject({ estado: 403, mensaje: "Solo el administrador puede dar de alta cuentas." });
  });

  test("compras, perfiles y cuentas: solo el perfil de administrador", () => {
    for (const ruta of ["/api/compras", "/api/perfiles", "/api/usuarios"]) {
      expect(evaluarAcceso(ruta, sesion("Administrador")).permitido).toBe(true);
      expect(evaluarAcceso(ruta, sesion("Bibliotecario")).permitido).toBe(false);
    }
  });

  test("Mi cuenta (/api/auth/cuenta) la consulta cualquier sesión", () => {
    expect(evaluarAcceso("/api/auth/cuenta", sesion("Alumno")).permitido).toBe(true);
  });
});

describe("HU6-SP0 · los permisos vienen del perfil, no del tipo de cuenta", () => {
  test("un alumno con un perfil que incluye Gestionar libros sí entra a /api/libros", () => {
    const conPerfil: Sesion = { ...sesion("Alumno"), perfil: "Becario", permisos: ["buscar-libros", "gestionar-libros"] };
    expect(evaluarAcceso("/api/libros", conPerfil).permitido).toBe(true);
    expect(evaluarAcceso("/api/chatbot", conPerfil).permitido).toBe(false);
  });
  test("un token sin permisos usa el perfil base de su tipo de cuenta", () => {
    expect(permisosDe(sesion("Bibliotecario"))).toEqual(PERFILES_BASE.Bibliotecario);
  });
  test("el perfil y los permisos viajan en el token", async () => {
    const conPerfil: Sesion = { ...sesion("Alumno"), perfil: "Becario", permisos: ["buscar-libros"] };
    expect(await verificarToken(await firmarToken(conPerfil))).toEqual(conPerfil);
  });
  test("jsonAscii convierte acentos a \\uXXXX para el encabezado del gateway", () => {
    expect(jsonAscii("función")).toBe("funci\\u00f3n");
    expect(JSON.parse(`"${jsonAscii("Sesión \"cerrada\"")}"`)).toBe("Sesión \"cerrada\"");
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
