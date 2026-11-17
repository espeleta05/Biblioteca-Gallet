/** Chatbot (Sprint 4) y verificación de usuarios contra la base escolar (Sprint 0). */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ModuloChatbot } from "../../chatbot/src/main";
import { obtenerPool } from "../../comun/db";
import { hoyEnBiblioteca } from "../../comun/dominio/fechas";
import { crearSimuladorEscolar } from "../../simuladores/src/main";
import { ModuloUsuarios } from "../../usuarios/src/main";
import { apagar, idDe, levantar, reiniciarBase, tokenDe } from "./ayuda";

let usuarios: INestApplication, chatbot: INestApplication;
const escolar = crearSimuladorEscolar();
const preguntar = async (usuario: string, texto: string) =>
  request(chatbot.getHttpServer()).post("/api/chatbot/mensajes").set("Authorization", await tokenDe(usuarios, usuario)).send({ texto });

beforeAll(async () => {
  await reiniciarBase();
  usuarios = await levantar(ModuloUsuarios, "usuarios");
  chatbot = await levantar(ModuloChatbot, "chatbot");
  await new Promise<void>((ok) => escolar.listen(4101, ok));
  // ALU030 tiene un préstamo vencido con multa pendiente para las consultas personales.
  const id = await idDe("ALU030");
  const { rows } = await obtenerPool().query<{ id_prestamo: number }>(
    `INSERT INTO PRESTAMOS (id_ejemplar, id_credencial, id_credencial_registra, fecha_prestamo, fecha_vencimiento)
     VALUES (1, $1, 2, $2::date - 9, $2::date - 2) RETURNING id_prestamo`, [id, hoyEnBiblioteca()]);
  await obtenerPool().query("INSERT INTO MULTAS (id_prestamo, id_credencial, motivo, monto_mxn) VALUES ($1, $2, 'Retraso', 20)", [rows[0].id_prestamo, id]);
});
afterAll(async () => { escolar.close(); await apagar(usuarios, chatbot); });

describe("Chatbot", () => {
  test.each([
    ["¿Cuántos días dura un préstamo?", /5 días hábiles/],
    ["¿Cuántas veces puedo renovar?", /hasta 2 veces/],
    ["¿Cuánto es la multa por entregar tarde?", /\$10 pesos/],
    ["Si pierdo un libro ¿cuánto pago?", /Banxico/],
  ])("reglas y políticas: %s", async (pregunta, esperado) => {
    const r = await preguntar("ALU031", pregunta);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ respuesta: expect.stringMatching(esperado), motor: "Clasificador local" });
  });

  test("consulta personal de multas", async () => {
    const r = await preguntar("ALU030", "¿Tengo multas?");
    expect(r.body.respuesta).toMatch(/1 multa\(s\) pendiente\(s\) por \$20\.00/);
  });

  test("consulta personal de vencimientos marca lo vencido", async () => {
    const r = await preguntar("ALU030", "¿Cuándo vence mi libro?");
    expect(r.body.respuesta).toMatch(/"Effective Java" venció el/);
  });

  test("todos los roles pueden usarlo y queda registro", async () => {
    expect((await preguntar("COL001", "¿Puedo renovar?")).status).toBe(200);
    const { rows } = await obtenerPool().query("SELECT COUNT(*)::int AS n FROM CHATBOT_LOGS");
    expect(rows[0].n).toBeGreaterThanOrEqual(7);
  });

  test.each([
    ["¿Qué puedo preguntar?", "ayuda", /Por ejemplo/],
    ["Buenos días", "ayuda", /Soy el asistente/],
    ["¿Hasta cuándo me puedo quedar el libro?", "regla:Vigencias", /5 días hábiles/],
    ["Se me perdió un libro, ¿qué hago?", "regla:Costos de reposición", /Banxico/],
  ])("formas naturales de preguntar: %s", async (pregunta, intencion, respuesta) => {
    const r = await preguntar("ALU031", pregunta);
    expect(r.body).toMatchObject({ intencion, respuesta: expect.stringMatching(respuesta) });
  });

  test("pregunta fuera de dominio → respuesta de ayuda", async () => {
    expect((await preguntar("ALU031", "¿Quién ganó el mundial?")).body.intencion).toBe("desconocida");
  });
});

describe("Ver la base de datos de la escuela y verificar usuarios", () => {
  test("sincroniza: agrega el alumno nuevo y marca como inactivo al dado de baja", async () => {
    const admin = await tokenDe(usuarios, "admin");
    const r = await request(usuarios.getHttpServer()).post("/api/usuarios/sincronizacion").set("Authorization", admin);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ consultados: 126, nuevos: 1 });
    const baja = await request(usuarios.getHttpServer()).post("/api/auth/sesion").send({ identificador: "ALU100", contrasena: "1234" });
    expect(baja.status).toBe(403);
    expect(baja.body.error).toMatch(/base de datos escolar/);
    expect((await request(usuarios.getHttpServer()).post("/api/auth/sesion").send({ identificador: "ALU101", contrasena: "1234" })).status).toBe(200);
  }, 30_000); // Proceso por lotes: 126 cuentas en una transacción.
});
