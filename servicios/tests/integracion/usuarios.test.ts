/**
 * Gestión de usuarios (Sprint 0) a través de su API pública:
 * autenticación JWT, bloqueo tras 5 intentos y acceso por rol (Propuesta 3.3:
 * "pruebas de acceso por cada rol").
 */
import { apagar, levantar, reiniciarBase, tokenDe } from "./ayuda";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ModuloUsuarios } from "../../usuarios/src/main";
import { crearAdministrador } from "../../usuarios/src/crear-administrador";

let app: INestApplication;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  await reiniciarBase();
  app = await levantar(ModuloUsuarios, "usuarios");
});
afterAll(async () => apagar(app));

describe("Autenticación", () => {
  test("credenciales correctas → token JWT y cookie httpOnly", async () => {
    const respuesta = await http().post("/api/auth/sesion").send({ identificador: "admin", contrasena: "1234" });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.sesion).toMatchObject({ identificador: "admin", rol: "Administrador" });
    expect(respuesta.body.token.split(".")).toHaveLength(3);
    expect(respuesta.headers["set-cookie"][0]).toMatch(/sigeb_token=.+HttpOnly/);
  });

  test("contraseña incorrecta → 401 sin revelar si el usuario existe", async () => {
    const respuesta = await http().post("/api/auth/sesion").send({ identificador: "ALU001", contrasena: "mala" });
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error).toBe("Usuario o contraseña incorrectos.");
  });

  test("HU1-SP0 esc. 4 · valores límite del bloqueo: el 2.º intento falla con 401 y el 3.º bloquea 15 minutos (423)", async () => {
    for (let intento = 1; intento <= 2; intento += 1) {
      expect((await http().post("/api/auth/sesion").send({ identificador: "ALU002", contrasena: "mala" })).status).toBe(401);
    }
    const tercero = await http().post("/api/auth/sesion").send({ identificador: "ALU002", contrasena: "mala" });
    expect(tercero.status).toBe(423);
    expect(tercero.body.error).toBe("Tu cuenta se bloqueó por varios intentos fallidos. Intenta de nuevo en 15 minutos.");
    const conContrasenaCorrecta = await http().post("/api/auth/sesion").send({ identificador: "ALU002", contrasena: "1234" });
    expect(conContrasenaCorrecta.status).toBe(423);
  });

  test("HU1-SP0 esc. 3: clave no registrada", async () => {
    const r = await http().post("/api/auth/sesion").send({ identificador: "NOEXISTE", contrasena: "1234" });
    expect(r.body.error).toBe("Usuario no registrado o inactivo. Acude con el administrador de la Biblioteca para verificar tu situación.");
  });

  test("HU1-SP0 esc. 1: el perfil y sus permisos van en la sesión, con mensaje de bienvenida", async () => {
    const r = await http().post("/api/auth/sesion").send({ identificador: "ALU003", contrasena: "1234" });
    expect(r.body).toMatchObject({ mensaje: "Bienvenido(a), Alumno ALU003.", sesion: { perfil: "Alumno", permisos: ["buscar-libros", "mis-prestamos", "chatbot"] } });
  });

  test("datos incompletos → 400 con formato de error uniforme y campos marcados", async () => {
    const respuesta = await http().post("/api/auth/sesion").send({ identificador: "admin" });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ error: "Revisa los campos marcados antes de guardar.", motivos: expect.any(Array), campos: ["contrasena"] });
  });
});

describe("Acceso por rol en el gateway (endpoint verificar)", () => {
  test.each([
    ["admin", "/api/usuarios", 200],
    ["B-0041", "/api/usuarios", 403],
    ["B-0041", "/api/prestamos", 200],
    ["B-0041", "/api/multas/3/pagos", 200],
    ["ALU003", "/api/busqueda?q=java", 200],
    ["ALU003", "/api/chatbot/mensajes", 200],
    ["ALU003", "/api/prestamos", 403],
    ["PROF001", "/api/libros", 403],
    ["COL001", "/api/busqueda", 200],
  ])("%s → %s responde %i", async (usuario, ruta, estado) => {
    const token = await tokenDe(app, usuario);
    const respuesta = await http().get("/api/auth/verificar").set("Authorization", token).set("X-Original-URI", ruta);
    expect(respuesta.status).toBe(estado);
  });

  test("HU2-SP0 esc. 4: el bibliotecario que da de alta cuentas recibe el mensaje en X-Mensaje", async () => {
    const token = await tokenDe(app, "B-0041");
    const r = await http().get("/api/auth/verificar").set("Authorization", token).set("X-Original-URI", "/api/usuarios").set("X-Original-Method", "POST");
    expect(r.status).toBe(403);
    expect(r.headers["x-mensaje"]).toBe("Solo el administrador puede dar de alta cuentas.");
  });

  test("sin token → 401", async () => {
    expect((await http().get("/api/auth/verificar").set("X-Original-URI", "/api/busqueda")).status).toBe(401);
  });
  test("token alterado → 401", async () => {
    const token = await tokenDe(app, "admin");
    expect((await http().get("/api/auth/verificar").set("Authorization", `${token}x`).set("X-Original-URI", "/api/usuarios")).status).toBe(401);
  });
});

describe("Gestión de personal", () => {
  test("el administrador da de alta un bibliotecario que puede iniciar sesión de inmediato", async () => {
    const admin = await tokenDe(app, "admin");
    const alta = await http().post("/api/usuarios").set("Authorization", admin)
      .send({ nombre: "Luis Pérez", identificador: "B-0100", correo: "luis.perez@ducky.edu.mx", rol: "Bibliotecario", contrasena: "segura123" });
    expect(alta.status).toBe(201);
    const sesion = await http().post("/api/auth/sesion").send({ identificador: "B-0100", contrasena: "segura123" });
    expect(sesion.body.sesion.rol).toBe("Bibliotecario");
  });

  test("HU2-SP0: alta de un alumno con contraseña temporal; duplicada y datos inválidos", async () => {
    const admin = await tokenDe(app, "admin");
    const alta = (datos: object) => http().post("/api/usuarios").set("Authorization", admin).send(datos);
    const nueva = { nombre: "Ana Prueba", identificador: "ALU999", correo: "ana@ducky.edu.mx", rol: "Alumno", contrasena: "temporal123" };
    expect((await alta(nueva)).body).toMatchObject({ clave: "ALU999", mensaje: "Cuenta creada con clave ALU999." });
    expect((await alta(nueva)).body.error).toBe("Ya existe una cuenta con la clave ALU999.");
    const invalida = await alta({ ...nueva, identificador: "ALU998", correo: "sinarroba" });
    expect(invalida.body).toMatchObject({ error: "Revisa los campos marcados antes de guardar.", campos: ["correo"] });
    expect((await http().post("/api/auth/sesion").send({ identificador: "ALU999", contrasena: "temporal123" })).body.sesion.rol).toBe("Alumno");
  });

  test("HU3-SP0: baja con motivo; propia, inexistente, repetida; la cuenta ya no entra", async () => {
    const admin = await tokenDe(app, "admin");
    const baja = (identificador: string) => http().post("/api/usuarios/bajas").set("Authorization", admin).send({ identificador, motivo: "Egresó de la Universidad" });
    expect((await baja("admin")).body.error).toBe("No puedes dar de baja tu propia cuenta.");
    expect((await baja("ZZZ")).body.error).toBe("La cuenta no existe.");
    expect((await baja("ALU010")).body.mensaje).toBe("Cuenta dada de baja.");
    expect((await baja("ALU010")).body.error).toBe("La cuenta ya está dada de baja.");
    expect((await http().post("/api/auth/sesion").send({ identificador: "ALU010", contrasena: "1234" })).status).toBe(403);
    const inactivas = await http().get("/api/usuarios?estatus=Inactiva").set("Authorization", admin);
    expect(inactivas.body[0]).toMatchObject({ identificador: "ALU010", motivoBaja: "Egresó de la Universidad", bajaPor: "admin" });
  });

  test("HU5-SP0 esc. 4: consultar sin dato ni filtro", async () => {
    const admin = await tokenDe(app, "admin");
    expect((await http().get("/api/usuarios").set("Authorization", admin)).body.error).toBe("Captura una clave o nombre o elige un filtro para buscar.");
  });

  test("despliegue: crea el primer administrador real y rechaza datos inseguros", async () => {
    await expect(crearAdministrador("A-0001", "Ana López", "ana.lopez@ducky.edu.mx", "corta")).rejects.toThrow(/al menos 12 caracteres/);
    await expect(crearAdministrador("admin", "Otro", "otro@ducky.edu.mx", "una-contrasena-larga")).rejects.toThrow(/ya existe/);
    await crearAdministrador("A-0001", "Ana López", "ana.lopez@ducky.edu.mx", "una-contrasena-larga");
    const sesion = await http().post("/api/auth/sesion").send({ identificador: "A-0001", contrasena: "una-contrasena-larga" });
    expect(sesion.body.sesion).toMatchObject({ rol: "Administrador", nombre: "Ana López" });
  });

  test("HU4-SP0: el administrador cambia datos y queda el historial; clave duplicada; el alumno no edita los suyos", async () => {
    const admin = await tokenDe(app, "admin");
    const lista = await http().get("/api/usuarios?q=ALU011").set("Authorization", admin);
    const id = lista.body[0].id;
    expect((await http().patch(`/api/usuarios/${id}`).set("Authorization", admin).send({ identificador: "ALU012" })).body.error).toBe("La clave ALU012 ya pertenece a otra cuenta.");
    expect((await http().patch(`/api/usuarios/${id}`).set("Authorization", admin).send({ nombre: "Alumna Once" })).body.mensaje).toBe("Datos de la cuenta actualizados.");
    const historial = await http().get(`/api/usuarios/${id}/historial`).set("Authorization", admin);
    expect(historial.body[0]).toMatchObject({ campo: "nombre", valorAnterior: "Alumno ALU011", valorNuevo: "Alumna Once", autor: "admin" });
    const alumno = await tokenDe(app, "ALU011");
    const propio = await http().patch("/api/auth/cuenta").set("Authorization", alumno).send({});
    expect(propio.status).toBe(403);
    expect(propio.body.error).toBe("Solo el administrador puede cambiar estos datos, por lo que debes acudir a la Biblioteca.");
  });
});

describe("HU6-SP0 · gestión de perfiles", () => {
  test("crear, duplicado, sin permisos, asignar, eliminar en uso y eliminar sin cuentas", async () => {
    const admin = await tokenDe(app, "admin");
    const crear = (nombre: string, permisos: string[]) => http().post("/api/perfiles").set("Authorization", admin).send({ nombre, permisos });
    const creado = await crear("Becario", ["buscar-libros", "gestionar-libros"]);
    expect(creado.body.mensaje).toBe("Perfil Becario creado.");
    expect((await crear("becario", ["buscar-libros"])).body.error).toBe("Ya existe un perfil con ese nombre.");
    expect((await crear("Vacío", [])).body.error).toBe("Selecciona al menos un permiso.");
    const asignado = await http().post("/api/perfiles/asignaciones").set("Authorization", admin).send({ identificador: "ALU020", idPerfil: creado.body.id });
    expect(asignado.body.mensaje).toMatch(/^Perfil asignado/);
    // Los permisos nuevos aplican desde el siguiente inicio de sesión.
    const sesion = await http().post("/api/auth/sesion").send({ identificador: "ALU020", contrasena: "1234" });
    expect(sesion.body.sesion).toMatchObject({ perfil: "Becario", permisos: ["buscar-libros", "gestionar-libros"] });
    const enUso = await http().delete(`/api/perfiles/${creado.body.id}`).set("Authorization", admin);
    expect(enUso.body).toMatchObject({ error: "No se puede eliminar un perfil que tiene cuentas asignadas.", motivos: ["1 cuenta(s) tienen el perfil Becario."] });
    const libre = await crear("Temporal", ["buscar-libros"]);
    expect((await http().delete(`/api/perfiles/${libre.body.id}`).set("Authorization", admin)).body.mensaje).toBe("Perfil eliminado.");
  });
});
