/**
 * Prestar y devolver libros (Sprint 2), gestión de multas y alumnos suspendidos
 * (Sprint 3), con los microservicios comunicándose entre sí y con los
 * simuladores de Tesorería y Servicios Escolares.
 */
import type { INestApplication } from "@nestjs/common";
import type { Server } from "http";
import request from "supertest";
import { ModuloAlumnosSuspendidos } from "../../alumnos-suspendidos/src/main";
import { PUERTOS } from "../../comun/config";
import { obtenerPool } from "../../comun/db";
import { hoyEnBiblioteca, sumarDiasHabiles } from "../../comun/dominio/fechas";
import { ModuloDevolverLibros } from "../../devolver-libros/src/main";
import { ModuloGestionMultas } from "../../gestion-multas/src/main";
import { ModuloPrestarLibros } from "../../prestar-libros/src/main";
import { crearSimuladorEscolar, crearSimuladorTesoreria } from "../../simuladores/src/main";
import { ModuloUsuarios } from "../../usuarios/src/main";
import { apagar, idDe, levantar, reiniciarBase, tokenDe } from "./ayuda";

let apps: Record<string, INestApplication> = {};
let escolar: ReturnType<typeof crearSimuladorEscolar>, tesoreria: ReturnType<typeof crearSimuladorTesoreria>;
let biblio: string, admin: string;

const escuchar = (servidor: Server, puerto: number) => new Promise<void>((ok) => servidor.listen(puerto, ok));
const prestamos = () => request(apps.prestar.getHttpServer());
const devoluciones = () => request(apps.devolver.getHttpServer());
const multas = () => request(apps.multas.getHttpServer());

async function prestar(identificador: string, idLibro: number, canalRecibo = "Impresión") {
  return prestamos().post("/api/prestamos").set("Authorization", biblio).send({ idSolicitante: await idDe(identificador), idLibro, canalRecibo });
}
/** Mueve el vencimiento de un préstamo N días naturales al pasado para simular retraso. */
async function vencerHaceDias(idPrestamo: number, dias: number) {
  await obtenerPool().query("UPDATE PRESTAMOS SET fecha_vencimiento = $2::date - $3::int WHERE id_prestamo = $1", [idPrestamo, hoyEnBiblioteca(), dias]);
}

beforeAll(async () => {
  await reiniciarBase();
  const modulos = { usuarios: ModuloUsuarios, prestar: ModuloPrestarLibros, devolver: ModuloDevolverLibros, multas: ModuloGestionMultas, suspendidos: ModuloAlumnosSuspendidos };
  const puertos = { usuarios: PUERTOS.usuarios, prestar: PUERTOS["prestar-libros"], devolver: PUERTOS["devolver-libros"], multas: PUERTOS["gestion-multas"], suspendidos: PUERTOS["alumnos-suspendidos"] };
  for (const [nombre, modulo] of Object.entries(modulos)) {
    apps[nombre] = await levantar(modulo, nombre);
    await apps[nombre].listen(puertos[nombre as keyof typeof puertos]);
  }
  escolar = crearSimuladorEscolar(); tesoreria = crearSimuladorTesoreria();
  await escuchar(escolar, 4101); await escuchar(tesoreria, 4102);
  biblio = await tokenDe(apps.usuarios, "B-0041");
  admin = await tokenDe(apps.usuarios, "admin");
});
afterAll(async () => {
  escolar.close(); tesoreria.close();
  await apagar(...Object.values(apps));
});

describe("Prestar libros (Reglas 1, 5 y 6)", () => {
  test("préstamo a alumno: vence en 5 días hábiles y entrega recibo impreso", async () => {
    const r = await prestar("ALU001", 1);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ folio: expect.stringMatching(/^P-\d{6}$/), vencimiento: sumarDiasHabiles(hoyEnBiblioteca(), 5), envio: { estado: "Enviado" } });
    expect(r.body.contenido).toMatch(/Recibo de préstamo/);
  });

  test("préstamo a profesor: 10 días hábiles; recibo por correo queda Simulado sin SMTP", async () => {
    const r = await prestar("PROF001", 1, "Correo");
    expect(r.body.vencimiento).toBe(sumarDiasHabiles(hoyEnBiblioteca(), 10));
    expect(r.body.envio).toMatchObject({ estado: "Simulado", destino: "prof001@ducky.edu.mx" });
  });

  test("caso límite: el tercer ejemplar se rechaza", async () => {
    expect((await prestar("ALU001", 2)).status).toBe(201);
    const tercero = await prestar("ALU001", 4);
    expect(tercero.status).toBe(409);
    expect(tercero.body.motivos.join(" ")).toMatch(/máximo es 2/);
  });

  test("libro de consulta interna no se presta", async () => {
    const r = await prestar("ALU003", 3);
    expect(r.status).toBe(409);
    expect(r.body.motivos[0]).toMatch(/Consulta interna/);
  });

  test("personal de la biblioteca no es solicitante", async () => {
    expect((await prestar("B-0041", 1)).status).toBe(409);
  });
});

describe("Renovación (Reglas 2 y 6)", () => {
  test("caso límite: un alumno renueva dos veces y la tercera se rechaza", async () => {
    const p = await prestar("ALU004", 4);
    expect((await prestamos().post(`/api/prestamos/${p.body.id}/renovaciones`).set("Authorization", biblio)).body.renovacion).toBe(1);
    expect((await prestamos().post(`/api/prestamos/${p.body.id}/renovaciones`).set("Authorization", biblio)).body.renovacion).toBe(2);
    const tercera = await prestamos().post(`/api/prestamos/${p.body.id}/renovaciones`).set("Authorization", biblio);
    expect(tercera.status).toBe(409);
    expect(tercera.body.motivos[0]).toMatch(/máximo para este usuario es 2/);
  });

  test("un préstamo vencido no se renueva", async () => {
    const p = await prestar("ALU005", 4);
    await vencerHaceDias(p.body.id, 1);
    expect((await prestamos().post(`/api/prestamos/${p.body.id}/renovaciones`).set("Authorization", biblio)).status).toBe(409);
  });
});

describe("Devolver libros y multas (Reglas 3 y 4)", () => {
  test("devolución tardía: $10 por día y luego el alumno no puede pedir otro libro", async () => {
    const p = await prestar("ALU006", 2);
    await vencerHaceDias(p.body.id, 3);
    const d = await devoluciones().post("/api/devoluciones").set("Authorization", biblio).send({ idPrestamo: p.body.id, condicion: "Buen estado" });
    expect(d.status).toBe(201);
    expect(d.body.multas).toEqual([expect.objectContaining({ motivo: "Retraso", montoMxn: 30 })]);
    const nuevo = await prestar("ALU006", 1);
    expect(nuevo.status).toBe(409);
    expect(nuevo.body.motivos[0]).toMatch(/debe 1 multa/);
  });

  test("libro perdido: costo de reposición = USD × tipo de cambio, con aviso a Tesorería y Servicios Escolares", async () => {
    const p = await prestar("ALU007", 5);
    const previa = await devoluciones().get(`/api/devoluciones/${p.body.id}/vista-previa?condicion=Perdido`).set("Authorization", biblio);
    expect(previa.body.cargos).toEqual([{ motivo: "Pérdida", montoMxn: 693.5 }]); // 38.00 USD × 18.25
    const d = await devoluciones().post("/api/devoluciones").set("Authorization", biblio).send({ idPrestamo: p.body.id, condicion: "Perdido" });
    expect(d.body).toMatchObject({ estadoEjemplar: "Perdido", total: 693.5, seguimiento: { tesoreria: "Aviso recibido por Tesorería.", serviciosEscolares: "Aviso recibido por Servicios Escolares." } });
    expect(tesoreria.avisos.at(-1)).toMatchObject({ tipo: "Libro perdido", identificador: "ALU007" });
  });

  test("robo: suspensión automática y aviso a Servicios Escolares", async () => {
    const p = await prestar("ALU008", 25); // libro de demostración con un solo ejemplar, exclusivo de esta prueba
    expect(p.status).toBe(201);
    const d = await devoluciones().post("/api/devoluciones").set("Authorization", biblio).send({ idPrestamo: p.body.id, condicion: "Robado" });
    expect(d.body.seguimiento.suspension).toMatch(/Usuario suspendido: Robo de libro/);
    expect(escolar.avisos.some((a) => a.tipo === "Suspensión" && a.identificador === "ALU008")).toBe(true);
    const nuevo = await prestar("ALU008", 1);
    expect(nuevo.body.motivos.join(" ")).toMatch(/suspendido/);
  });

  test("exceso de multas: la tercera multa pendiente suspende automáticamente", async () => {
    for (let i = 0; i < 3; i += 1) {
      const { rows } = await obtenerPool().query<{ id_prestamo: number }>(
        `INSERT INTO PRESTAMOS (id_ejemplar, id_credencial, id_credencial_registra, fecha_prestamo, fecha_vencimiento)
         VALUES ((SELECT id_ejemplar FROM EJEMPLARES WHERE estado = 'Disponible' AND id_libro > 6 ORDER BY id_ejemplar LIMIT 1), $1, 2, $2::date - 10, $2::date - 2) RETURNING id_prestamo`,
        [await idDe("ALU009"), hoyEnBiblioteca()]);
      await obtenerPool().query("UPDATE EJEMPLARES SET estado = 'Prestado' WHERE id_ejemplar = (SELECT id_ejemplar FROM PRESTAMOS WHERE id_prestamo = $1)", [rows[0].id_prestamo]);
      const d = await devoluciones().post("/api/devoluciones").set("Authorization", biblio).send({ idPrestamo: rows[0].id_prestamo, condicion: "Buen estado" });
      if (i < 2) expect(d.body.seguimiento.suspension).toBe("Sin suspensión.");
      else expect(d.body.seguimiento.suspension).toMatch(/Exceso de multas \(3 pendientes\)/);
    }
  });
});

describe("Gestión de multas", () => {
  test("pago: Tesorería debe confirmar la referencia; luego se emite recibo de pago", async () => {
    const lista = await multas().get("/api/multas?estatus=Pendiente&q=ALU006").set("Authorization", biblio);
    const multa = lista.body[0];
    const invalida = await multas().post(`/api/multas/${multa.id}/pagos`).set("Authorization", biblio).send({ referenciaTesoreria: "ABC-1", montoMxn: 30, canalRecibo: "Impresión" });
    expect(invalida.status).toBe(409);
    expect(invalida.body.motivos[0]).toMatch(/no existe en Tesorería/);
    const montoMal = await multas().post(`/api/multas/${multa.id}/pagos`).set("Authorization", biblio).send({ referenciaTesoreria: "TES-000001", montoMxn: 20, canalRecibo: "Impresión" });
    expect(montoMal.body.error).toMatch(/no coincide/);
    const ok = await multas().post(`/api/multas/${multa.id}/pagos`).set("Authorization", biblio).send({ referenciaTesoreria: "TES-000001", montoMxn: 30, canalRecibo: "Impresión" });
    expect(ok.status).toBe(201);
    expect(ok.body.folio).toMatch(/^M-\d{6}$/);
    expect(ok.body.contenido).toMatch(/TES-000001/);
    expect((await prestar("ALU006", 1)).status).toBe(201);
  });

  test("revocación: solo el administrador, con motivo", async () => {
    const lista = await multas().get("/api/multas?estatus=Pendiente&q=ALU009").set("Authorization", biblio);
    expect((await multas().post(`/api/multas/${lista.body[0].id}/revocacion`).set("Authorization", biblio).send({ motivo: "Error de captura en la devolución" })).status).toBe(409);
    expect((await multas().post(`/api/multas/${lista.body[0].id}/revocacion`).set("Authorization", admin).send({ motivo: "Error de captura en la devolución" })).status).toBe(201);
  });

  test("lista de personas con adeudos y avisos de adeudo", async () => {
    const adeudos = await multas().get("/api/adeudos").set("Authorization", biblio);
    expect(adeudos.body.map((a: { identificador: string }) => a.identificador)).toEqual(expect.arrayContaining(["ALU007", "ALU008", "ALU009"]));
    const avisos = await multas().post("/api/adeudos/avisos").set("Authorization", biblio).send({ canal: "Correo" });
    expect(avisos.body.enviados).toBe(adeudos.body.length);
    expect(avisos.body.resultados.every((r: { estado: string }) => r.estado === "Simulado")).toBe(true);
  });

  test("validar fechas: préstamos vencidos con multa acumulada", async () => {
    const p = await prestar("ALU010", 26); // libro exclusivo de esta prueba
    expect(p.status).toBe(201);
    await vencerHaceDias(p.body.id, 4);
    const vencidos = await multas().get("/api/multas/prestamos-vencidos").set("Authorization", biblio);
    expect(vencidos.body.find((v: { id: number }) => v.id === p.body.id)).toMatchObject({ diasRetraso: 4, multaAcumuladaMxn: 40 });
  });
});

describe("Lista de espera", () => {
  test("se registra cuando no hay ejemplares y avisa al devolverse uno", async () => {
    const libro = 6; // SWEBOK: un solo ejemplar, se cambia a préstamo externo para la prueba
    await obtenerPool().query("UPDATE LIBROS SET tipo_uso = 'Préstamo externo' WHERE id_libro = $1", [libro]);
    const p = await prestar("PROF002", libro);
    expect((await prestamos().post("/api/lista-espera").set("Authorization", biblio).send({ idSolicitante: await idDe("ALU020"), idLibro: libro })).status).toBe(201);
    const repetida = await prestamos().post("/api/lista-espera").set("Authorization", biblio).send({ idSolicitante: await idDe("ALU020"), idLibro: libro });
    expect(repetida.body.error).toMatch(/ya está en la lista de espera/);
    const d = await devoluciones().post("/api/devoluciones").set("Authorization", biblio).send({ idPrestamo: p.body.id, condicion: "Buen estado" });
    expect(d.body.seguimiento.listaEspera).toBe("Se avisó a la primera persona en espera.");
    const otro = await prestar("ALU021", libro);
    expect(otro.body.error).toMatch(/No se autoriza|apartado/);
    expect((await prestar("ALU020", libro)).status).toBe(201);
  });
});

describe("Trazabilidad (ISO 9001)", () => {
  test("cada operación quedó en la bitácora", async () => {
    const { rows } = await obtenerPool().query<{ accion: string }>("SELECT DISTINCT accion FROM BITACORA");
    expect(rows.map((r) => r.accion)).toEqual(expect.arrayContaining(["Préstamo registrado", "Renovación", "Devolución registrada", "Pago registrado", "Multa revocada", "Suspensión automática", "Lista de espera"]));
  });
});
