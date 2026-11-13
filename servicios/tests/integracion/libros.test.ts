/** Gestionar libros y Buscar libros (Sprint 1) a través de sus APIs públicas. */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ModuloBuscarLibros } from "../../buscar-libros/src/main";
import { ModuloGestionarLibros } from "../../gestionar-libros/src/main";
import { ModuloUsuarios } from "../../usuarios/src/main";
import { apagar, levantar, reiniciarBase, tokenDe } from "./ayuda";

let usuarios: INestApplication, gestion: INestApplication, busqueda: INestApplication;
let bibliotecario: string, alumno: string;

const fichaNueva = {
  isbn: "978-0-13-235088-4", titulo: "Clean Code (2.ª ed.)", autores: ["Robert C. Martin"], editorial: "Prentice Hall", tema: "Ingeniería de software",
  edicion: 2, anioPublicacion: 2025, paginas: 480, tipoUso: "Préstamo externo", precioUsd: 45.5, ejemplares: 2,
  ubicacion: { piso: "Piso 3", area: "Tecnología", pasillo: "B", estante: "07" },
};

beforeAll(async () => {
  await reiniciarBase();
  [usuarios, gestion, busqueda] = await Promise.all([levantar(ModuloUsuarios, "usuarios"), levantar(ModuloGestionarLibros, "gestionar-libros"), levantar(ModuloBuscarLibros, "buscar-libros")]);
  bibliotecario = await tokenDe(usuarios, "B-0041");
  alumno = await tokenDe(usuarios, "ALU001");
});
afterAll(async () => apagar(usuarios, gestion, busqueda));

describe("Ficha bibliográfica", () => {
  test("ISBN con dígito verificador incorrecto → 409 con explicación", async () => {
    // 9780132350884 es el ISBN de Clean Code ya registrado; se altera su dígito verificador.
    const r = await request(gestion.getHttpServer()).post("/api/libros").set("Authorization", bibliotecario).send({ ...fichaNueva, isbn: "9780132350885" });
    expect(r.status).toBe(409);
    expect(r.body.motivos[0]).toMatch(/dígito verificador/);
  });

  test("ficha sin precio en dólares → 400 (lo exige la Regla 4)", async () => {
    const { precioUsd: _omitido, ...sinPrecio } = fichaNueva;
    const r = await request(gestion.getHttpServer()).post("/api/libros").set("Authorization", bibliotecario).send({ ...sinPrecio, isbn: "9780306406157" });
    expect(r.status).toBe(400);
    expect(r.body.motivos.join(" ")).toMatch(/Regla 4/);
  });

  test("el bibliotecario crea la ficha con sus ejemplares y ubicación", async () => {
    const r = await request(gestion.getHttpServer()).post("/api/libros").set("Authorization", bibliotecario).send({ ...fichaNueva, isbn: "9780306406157" });
    expect(r.status).toBe(201);
    const ficha = await request(gestion.getHttpServer()).get(`/api/libros/${r.body.id}`).set("Authorization", bibliotecario);
    expect(ficha.body).toMatchObject({ isbn: "9780306406157", precioUsd: 45.5, autores: ["Robert C. Martin"] });
    expect(ficha.body.ejemplares).toHaveLength(2);
    expect(ficha.body.ejemplares[0]).toMatchObject({ estado: "Disponible", piso: "Piso 3", pasillo: "B" });
  });

  test("un ISBN repetido → 409", async () => {
    const r = await request(gestion.getHttpServer()).post("/api/libros").set("Authorization", bibliotecario).send({ ...fichaNueva, isbn: "9780134685991" });
    expect(r.status).toBe(409);
  });

  test("un alumno no puede gestionar libros → 403", async () => {
    const r = await request(gestion.getHttpServer()).get("/api/libros").set("Authorization", alumno);
    expect(r.status).toBe(403);
  });
});

describe("Estado del libro y listado por filtros", () => {
  test("marcar un ejemplar como Perdido lo refleja en el listado por estado", async () => {
    const http = request(gestion.getHttpServer());
    const ficha = await http.get("/api/libros/2").set("Authorization", bibliotecario);
    const cambio = await http.patch(`/api/libros/2/ejemplares/${ficha.body.ejemplares[0].id}`).set("Authorization", bibliotecario).send({ estado: "Perdido" });
    expect(cambio.status).toBe(200);
    const perdidos = await http.get("/api/libros?estado=Perdido").set("Authorization", bibliotecario);
    expect(perdidos.body.map((l: { titulo: string }) => l.titulo)).toContain("Clean Code");
  });

  test("no se puede marcar como Prestado a mano", async () => {
    const http = request(gestion.getHttpServer());
    const ficha = await http.get("/api/libros/1").set("Authorization", bibliotecario);
    const r = await http.patch(`/api/libros/1/ejemplares/${ficha.body.ejemplares[0].id}`).set("Authorization", bibliotecario).send({ estado: "Prestado" });
    expect(r.status).toBe(409);
  });

  test.each([
    ["tema=Literatura", ["Don Quijote de la Mancha"]],
    ["tipoUso=Consulta%20interna", ["Introduction to Algorithms"]],
    ["q=martin", ["Clean Code"]],
  ])("filtro %s", async (filtro, titulos) => {
    const r = await request(gestion.getHttpServer()).get(`/api/libros?${filtro}`).set("Authorization", bibliotecario);
    expect(r.body.map((l: { titulo: string }) => l.titulo)).toEqual(expect.arrayContaining(titulos));
  });
});

describe("Buscar libros (todos los roles)", () => {
  test("un alumno consulta existencia y ubicación", async () => {
    const r = await request(busqueda.getHttpServer()).get("/api/busqueda?q=effective").set("Authorization", alumno);
    expect(r.status).toBe(200);
    expect(r.body[0]).toMatchObject({ titulo: "Effective Java", existencia: 3, disponibles: 3, ubicaciones: [{ piso: "Piso 2", area: "Tecnología", pasillo: "A", estante: "14" }] });
  });

  test("soloDisponibles excluye libros sin ejemplares disponibles", async () => {
    const r = await request(busqueda.getHttpServer()).get("/api/busqueda?soloDisponibles=true").set("Authorization", alumno);
    expect(r.body.every((l: { disponibles: number }) => l.disponibles > 0)).toBe(true);
  });

  test("sin sesión → 401", async () => {
    expect((await request(busqueda.getHttpServer()).get("/api/busqueda")).status).toBe(401);
  });
});

describe("Solicitud de compra", () => {
  test("el bibliotecario solicita y solo el administrador decide", async () => {
    const http = request(gestion.getHttpServer());
    const alta = await http.post("/api/solicitudes-compra").set("Authorization", bibliotecario).send({ titulo: "Refactoring", autor: "Martin Fowler", cantidad: 2, justificacion: "Alta demanda en Ingeniería de Software" });
    expect(alta.status).toBe(201);
    expect((await http.patch(`/api/solicitudes-compra/${alta.body.id}`).set("Authorization", bibliotecario).send({ estatus: "Aprobada" })).status).toBe(409);
    const admin = await tokenDe(usuarios, "admin");
    expect((await http.patch(`/api/solicitudes-compra/${alta.body.id}`).set("Authorization", admin).send({ estatus: "Aprobada" })).status).toBe(200);
  });
});
