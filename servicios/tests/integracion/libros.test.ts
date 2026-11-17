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
  ubicacion: { piso: "Piso 2", area: "Tecnología", pasillo: "B", estante: "07" },
};

beforeAll(async () => {
  await reiniciarBase();
  [usuarios, gestion, busqueda] = await Promise.all([levantar(ModuloUsuarios, "usuarios"), levantar(ModuloGestionarLibros, "gestionar-libros"), levantar(ModuloBuscarLibros, "buscar-libros")]);
  bibliotecario = await tokenDe(usuarios, "B-0041");
  alumno = await tokenDe(usuarios, "ALU001");
});
afterAll(async () => apagar(usuarios, gestion, busqueda));

describe("Ficha bibliográfica", () => {
  test("ISBN con dígito verificador incorrecto → 400 con explicación y el campo marcado", async () => {
    // 9780132350884 es el ISBN de Clean Code ya registrado; se altera su dígito verificador.
    const r = await request(gestion.getHttpServer()).post("/api/libros").set("Authorization", bibliotecario).send({ ...fichaNueva, isbn: "9780132350885" });
    expect(r.status).toBe(400);
    expect(r.body.motivos[0]).toMatch(/dígito verificador/);
    expect(r.body.campos).toEqual(["isbn"]);
  });

  test("HU1-SP1 esc. 3: datos incompletos → \"Captura todos los campos obligatorios\"", async () => {
    const r = await request(gestion.getHttpServer()).post("/api/libros").set("Authorization", bibliotecario).send({ ...fichaNueva, titulo: "", isbn: "9780306406157" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: "Captura todos los campos obligatorios.", campos: ["titulo"] });
  });

  test("HU1-SP1 esc. 4: ubicación que no existe en la Biblioteca", async () => {
    const r = await request(gestion.getHttpServer()).post("/api/libros").set("Authorization", bibliotecario)
      .send({ ...fichaNueva, isbn: "9780306406157", ubicacion: { piso: "Piso 2", area: "Tecnología", pasillo: "Z", estante: "99" } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("La ubicación Piso 2-Tecnología-Z-99 no existe en la Biblioteca.");
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
    expect(r.body.mensaje).toBe(`Libro registrado con clave LIB-${String(r.body.id).padStart(4, "0")}.`);
    const ficha = await request(gestion.getHttpServer()).get(`/api/libros/${r.body.id}`).set("Authorization", bibliotecario);
    expect(ficha.body).toMatchObject({ isbn: "9780306406157", precioUsd: 45.5, autores: ["Robert C. Martin"] });
    expect(ficha.body.ejemplares).toHaveLength(2);
    expect(ficha.body.ejemplares[0]).toMatchObject({ estado: "Disponible", piso: "Piso 2", pasillo: "B" });
  });

  test("HU1-SP1 esc. 2: un ISBN repetido → 409 con la clave del libro existente", async () => {
    const r = await request(gestion.getHttpServer()).post("/api/libros").set("Authorization", bibliotecario).send({ ...fichaNueva, isbn: "9780134685991" });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("El libro ya existe con clave LIB-0001. Para agregar ejemplares usa la opción Cambio de libros.");
  });

  test("HU3-SP1: el cambio guarda el dato anterior; un ISBN de otro libro se rechaza", async () => {
    const http = request(gestion.getHttpServer());
    expect((await http.patch("/api/libros/4").set("Authorization", bibliotecario).send({ isbn: "9780134685991" })).body.error).toBe("El ISBN ya pertenece al libro con clave LIB-0001.");
    expect((await http.patch("/api/libros/4").set("Authorization", bibliotecario).send({ paginas: 1100 })).body.mensaje).toBe("Libro actualizado.");
    const historial = await http.get("/api/libros/4/historial").set("Authorization", bibliotecario);
    expect(historial.body[0]).toMatchObject({ campo: "páginas", valorAnterior: "1056", valorNuevo: "1100", autor: "B-0041" });
  });

  test("HU4-SP1: consulta por clave o ISBN, y mensajes sin dato o inexistente", async () => {
    const http = request(gestion.getHttpServer());
    expect((await http.get("/api/libros/consulta?dato=LIB-0004").set("Authorization", bibliotecario)).body).toMatchObject({ titulo: "Don Quijote de la Mancha", clave: "LIB-0004" });
    expect((await http.get("/api/libros/consulta?dato=978-0-13-468599-1").set("Authorization", bibliotecario)).body.titulo).toBe("Effective Java");
    expect((await http.get("/api/libros/consulta?dato=").set("Authorization", bibliotecario)).body.error).toBe("Captura la clave o el ISBN del libro.");
    expect((await http.get("/api/libros/consulta?dato=9780000000002").set("Authorization", bibliotecario)).body.error).toBe("No existe ningún libro con la clave o ISBN 9780000000002.");
  });

  test("HU2-SP1: baja con motivo; sin motivo, inexistente y último ejemplar", async () => {
    const http = request(gestion.getHttpServer());
    const baja = (clave: string, motivo: string) => http.post("/api/libros/ejemplares/baja").set("Authorization", bibliotecario).send({ clave, motivo });
    expect((await baja("DQM-001", "")).body.error).toBe("Selecciona el motivo de la baja.");
    expect((await baja("NOPE-1", "Perdido")).body.error).toBe("La clave NOPE-1 no existe.");
    expect((await baja("DQM-001", "Obsoleto")).body.mensaje).toBe("Ejemplar dado de baja.");
    expect((await baja("DQM-002", "Dañado")).body.mensaje).toBe("Se dio de baja el último ejemplar y el libro ya no aparecerá en las búsquedas.");
    const r = await request(busqueda.getHttpServer()).get("/api/busqueda?criterio=titulo&texto=quijote").set("Authorization", alumno);
    expect(r.body).toEqual([]);
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

  test("HU1-SP2: por criterio con mínimo 3 caracteres; cada ubicación con sus copias", async () => {
    const buscar = (consulta: string) => request(busqueda.getHttpServer()).get(`/api/busqueda?${consulta}`).set("Authorization", alumno);
    expect((await buscar("criterio=autor&texto=bl")).body.error).toBe("Escribe por lo menos 3 caracteres para buscar.");
    const r = await buscar("criterio=editorial&texto=addison");
    expect(r.body.map((l: { titulo: string }) => l.titulo)).toContain("Effective Java");
    const ej = r.body.find((l: { titulo: string }) => l.titulo === "Effective Java");
    expect(ej.ubicaciones[0]).toMatchObject({ piso: "Piso 2", disponibles: 3, total: 3 });
    expect((await buscar("criterio=clave&texto=LIB-0001")).body[0].titulo).toBe("Effective Java");
    // Sin acentos ni mayúsculas: "INGENIERIA" encuentra "Ingeniería de software".
    expect((await buscar("criterio=tema&texto=INGENIERIA")).body.map((l: { titulo: string }) => l.titulo)).toContain("Clean Code");
  });
});

describe("HU6-SP1 · listado para inventario", () => {
  test("sin filtros se pide uno; con filtros, un renglón por ejemplar", async () => {
    const http = request(gestion.getHttpServer());
    expect((await http.get("/api/libros/inventario").set("Authorization", bibliotecario)).body.error).toBe("Elige al menos un filtro para generar el listado.");
    const r = await http.get("/api/libros/inventario?tema=Programaci%C3%B3n&piso=Piso%202").set("Authorization", bibliotecario);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.every((e: { tema: string; piso: string }) => e.tema === "Programación" && e.piso === "Piso 2")).toBe(true);
  });
});

describe("HU5-SP1 · compra de libros", () => {
  test("presupuesto excedido, orden registrada y recepción parcial", async () => {
    const http = request(gestion.getHttpServer());
    const admin = await tokenDe(usuarios, "admin");
    const orden = (cantidad: number, precioMxn: number) => http.post("/api/compras").set("Authorization", admin)
      .send({ editorial: "Addison-Wesley", libros: [{ titulo: "Domain-Driven Design", isbn: "9780321125217", cantidad, precioMxn }] });
    const excede = await orden(30, 900);
    expect(excede.status).toBe(409);
    expect(excede.body.error).toBe("La compra excede el presupuesto del mes por $7,000.00.");
    expect((await http.post("/api/compras").set("Authorization", admin).send({ editorial: "", libros: [{ titulo: "X", isbn: "9780321125217", cantidad: 0, precioMxn: 0 }] })).body.error)
      .toBe("Revisa la editorial, las cantidades y los precios.");
    const ok = await orden(3, 1100);
    expect(ok.body).toMatchObject({ folio: "OC-000001", mensaje: "Orden de compra OC-000001 registrada.", disponibleMxn: 16700 });
    const ordenes = await http.get("/api/compras").set("Authorization", admin);
    const parcial = await http.post(`/api/compras/${ordenes.body[0].id}/recepcion`).set("Authorization", admin).send({ recibidos: [{ idDetalle: ordenes.body[0].libros[0].id, cantidad: 2 }] });
    expect(parcial.body).toMatchObject({ estatus: "Recibida parcialmente", mensaje: "Falta 1 libro por recibir de la orden OC-000001." });
    const avisos = await http.get("/api/libros/avisos").set("Authorization", bibliotecario);
    expect(avisos.body[0]).toMatchObject({ tipo: "Libro por dar de alta", isbn: "9780321125217" });
    expect((await http.get("/api/compras").set("Authorization", bibliotecario)).status).toBe(403);
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
