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

  test("valores límite del bloqueo: el 4.º intento falla con 401 y el 5.º bloquea (423)", async () => {
    for (let intento = 1; intento <= 4; intento += 1) {
      expect((await http().post("/api/auth/sesion").send({ identificador: "ALU002", contrasena: "mala" })).status).toBe(401);
    }
    const quinto = await http().post("/api/auth/sesion").send({ identificador: "ALU002", contrasena: "mala" });
    expect(quinto.status).toBe(423);
    expect(quinto.body.error).toMatch(/5 intentos fallidos/);
    const conContrasenaCorrecta = await http().post("/api/auth/sesion").send({ identificador: "ALU002", contrasena: "1234" });
    expect(conContrasenaCorrecta.status).toBe(423);
  });

  test("datos incompletos → 400 con formato de error uniforme", async () => {
    const respuesta = await http().post("/api/auth/sesion").send({ identificador: "admin" });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ error: "Los datos enviados no son válidos.", motivos: expect.any(Array) });
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

  test("no se pueden crear alumnos desde SIGEB (vienen de la base escolar)", async () => {
    const admin = await tokenDe(app, "admin");
    const alta = await http().post("/api/usuarios").set("Authorization", admin)
      .send({ nombre: "X", identificador: "ALU999", correo: "x@ducky.edu.mx", rol: "Alumno", contrasena: "segura123" });
    expect(alta.status).toBe(400);
    expect(alta.body.motivos.join(" ")).toMatch(/solo se da de alta personal/);
  });

  test("una cuenta desactivada no puede iniciar sesión", async () => {
    const admin = await tokenDe(app, "admin");
    const lista = await http().get("/api/usuarios?q=ALU010").set("Authorization", admin);
    expect((await http().patch(`/api/usuarios/${lista.body[0].id}`).set("Authorization", admin).send({ estatus: "Inactiva" })).status).toBe(200);
    expect((await http().post("/api/auth/sesion").send({ identificador: "ALU010", contrasena: "1234" })).status).toBe(403);
  });

  test("despliegue: crea el primer administrador real y rechaza datos inseguros", async () => {
    await expect(crearAdministrador("A-0001", "Ana López", "ana.lopez@ducky.edu.mx", "corta")).rejects.toThrow(/al menos 12 caracteres/);
    await expect(crearAdministrador("admin", "Otro", "otro@ducky.edu.mx", "una-contrasena-larga")).rejects.toThrow(/ya existe/);
    await crearAdministrador("A-0001", "Ana López", "ana.lopez@ducky.edu.mx", "una-contrasena-larga");
    const sesion = await http().post("/api/auth/sesion").send({ identificador: "A-0001", contrasena: "una-contrasena-larga" });
    expect(sesion.body.sesion).toMatchObject({ rol: "Administrador", nombre: "Ana López" });
  });

  test("los datos escolares no se editan en SIGEB", async () => {
    const admin = await tokenDe(app, "admin");
    const lista = await http().get("/api/usuarios?q=ALU011").set("Authorization", admin);
    const cambio = await http().patch(`/api/usuarios/${lista.body[0].id}`).set("Authorization", admin).send({ nombre: "Otro" });
    expect(cambio.status).toBe(409);
    expect(cambio.body.error).toMatch(/base de datos escolar/);
  });
});
