/**
 * Microservicio "Devolver libros" (Sprint 2): registro de la devolución y
 * generación de multas por entrega extemporánea, daño o pérdida (Reglas 3 y 4).
 * Después de confirmar la devolución avisa a Lista de espera, a Alumnos
 * suspendidos y, si el libro se perdió o robó, a Tesorería y Servicios Escolares.
 */
import "reflect-metadata";
import { Body, Controller, Get, Injectable, Module, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
import { IsIn, IsInt, Min } from "class-validator";
import type { Sesion } from "../../comun/auth";
import { formatoPesos } from "../../comun/avisos";
import { PUERTOS } from "../../comun/config";
import { consultarUno, enTransaccion, type Ejecutor, obtenerPool, registrarEnBitacora } from "../../comun/db";
import { diasDeRetraso, hoyEnBiblioteca } from "../../comun/dominio/fechas";
import { cargosPorDevolucion, type CargoDevolucion } from "../../comun/dominio/multas";
import { estadoTrasDevolucion } from "../../comun/dominio/prestamos";
import { avisarServiciosEscolares, avisarTesoreria, llamarServicio } from "../../comun/integraciones";
import { ErrorDeNegocio, iniciarServicio, NoEncontrado, UsuarioActual } from "../../comun/nest";
import { tipoCambioVigente } from "../../comun/tipo-cambio";

type Condicion = "Buen estado" | "Dañado" | "Perdido" | "Robado";
const CONDICIONES: Condicion[] = ["Buen estado", "Dañado", "Perdido", "Robado"];

export class DevolucionDto {
  @IsInt() @Min(1) idPrestamo!: number;
  @IsIn(CONDICIONES, { message: `La condición debe ser: ${CONDICIONES.join(", ")}.` }) condicion!: Condicion;
}
export class CondicionDto { @IsIn(CONDICIONES) condicion!: Condicion; }

type DatosPrestamo = { id_credencial: number; id_ejemplar: number; id_libro: number; estado: string; fecha_vencimiento: string; titulo: string; identificador: string; precio: number };

@Injectable()
export class ServicioDevoluciones {
  private async prestamo(idPrestamo: number, ejecutor: Ejecutor, bloquear = false): Promise<DatosPrestamo> {
    const fila = await consultarUno<DatosPrestamo>(`
      SELECT p.id_credencial, p.id_ejemplar, e.id_libro, p.estado, p.fecha_vencimiento, l.titulo, c.matricula_nomina AS identificador, l.precio_ultima_compra_usd AS precio
      FROM PRESTAMOS p JOIN EJEMPLARES e ON e.id_ejemplar = p.id_ejemplar JOIN LIBROS l ON l.id_libro = e.id_libro
      JOIN CREDENCIALES c ON c.id_credencial = p.id_credencial
      WHERE p.id_prestamo = $1 ${bloquear ? "FOR UPDATE OF p" : ""}`, [idPrestamo], ejecutor);
    if (!fila) throw new NoEncontrado("El préstamo");
    if (fila.estado !== "Activo") throw new ErrorDeNegocio("El préstamo ya fue devuelto.");
    return fila;
  }

  /** Muestra al bibliotecario los cargos antes de confirmar. */
  async vistaPrevia(idPrestamo: number, condicion: Condicion) {
    const p = await this.prestamo(idPrestamo, obtenerPool());
    const tipoCambio = await tipoCambioVigente();
    const cargos = cargosPorDevolucion({ vencimiento: p.fecha_vencimiento, fechaReporte: hoyEnBiblioteca(), condicion, precioUltimaCompraUsd: p.precio, tipoCambioMxnPorUsd: tipoCambio.valor });
    return { cargos, total: cargos.reduce((s, c) => s + c.montoMxn, 0), tipoCambio };
  }

  async devolver(idPrestamo: number, condicion: Condicion, autor: Sesion) {
    const hoy = hoyEnBiblioteca();
    const tipoCambio = condicion === "Buen estado" ? null : await tipoCambioVigente();
    const resultado = await enTransaccion(async (cliente) => {
      const p = await this.prestamo(idPrestamo, cliente, true);
      const cargos: CargoDevolucion[] = cargosPorDevolucion({ vencimiento: p.fecha_vencimiento, fechaReporte: hoy, condicion, precioUltimaCompraUsd: p.precio, tipoCambioMxnPorUsd: tipoCambio?.valor ?? 1 });
      await cliente.query("UPDATE PRESTAMOS SET estado = 'Devuelto', fecha_devolucion = $2, condicion_devolucion = $3 WHERE id_prestamo = $1", [idPrestamo, hoy, condicion]);
      const estadoEjemplar = estadoTrasDevolucion(condicion);
      await cliente.query("UPDATE EJEMPLARES SET estado = $2 WHERE id_ejemplar = $1", [p.id_ejemplar, estadoEjemplar]);
      const multas: Array<CargoDevolucion & { id: number }> = [];
      for (const cargo of cargos) {
        const fila = await consultarUno<{ id_multa: number }>(`
          INSERT INTO MULTAS (id_prestamo, id_credencial, motivo, monto_mxn, dias_retraso, tipo_cambio)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_multa`,
          [idPrestamo, p.id_credencial, cargo.motivo, cargo.montoMxn, cargo.motivo === "Retraso" ? diasDeRetraso(p.fecha_vencimiento, hoy) : null, cargo.motivo === "Retraso" ? null : tipoCambio?.valor], cliente);
        multas.push({ ...cargo, id: fila!.id_multa });
      }
      await registrarEnBitacora(cliente, "devolver-libros", "Devolución registrada",
        `préstamo ${idPrestamo} · ${condicion} · ${cargos.map((c) => `${c.motivo} ${formatoPesos(c.montoMxn)}`).join(", ") || "sin multa"}`, autor.id);
      return { p, multas, estadoEjemplar };
    });

    // Seguimiento entre microservicios. La devolución ya quedó registrada: si alguno
    // falla se informa en la respuesta sin deshacerla.
    const seguimiento: Record<string, string> = {};
    const intentar = async (clave: string, accion: () => Promise<string>) => {
      try { seguimiento[clave] = await accion(); } catch (error) { seguimiento[clave] = `Pendiente: ${(error as Error).message.slice(0, 150)}`; }
    };
    const { p, multas, estadoEjemplar } = resultado;
    if (estadoEjemplar === "Disponible") {
      await intentar("listaEspera", async () => ((await llamarServicio<{ avisado: boolean }>("prestar-libros", "/api/lista-espera/avisos", { idLibro: p.id_libro })).avisado ? "Se avisó a la primera persona en espera." : "Nadie en espera."));
    }
    if (multas.length) {
      await intentar("suspension", async () => {
        const r = await llamarServicio<{ suspendido: boolean; causa?: string }>("alumnos-suspendidos", "/api/suspensiones/evaluaciones", { idCredencial: p.id_credencial, motivoNuevaMulta: multas[multas.length - 1].motivo });
        return r.suspendido ? `Usuario suspendido: ${r.causa}.` : "Sin suspensión.";
      });
    }
    if (condicion === "Perdido" || condicion === "Robado") {
      const reposicion = multas.find((m) => m.motivo !== "Retraso")!;
      const datos = { identificador: p.identificador, titulo: p.titulo, montoMxn: reposicion.montoMxn, condicion };
      await intentar("tesoreria", async () => (await avisarTesoreria({ tipo: "Libro perdido", identificador: p.identificador, montoMxn: reposicion.montoMxn, concepto: `${condicion}: ${p.titulo}` })).detalle);
      await intentar("serviciosEscolares", async () => (await avisarServiciosEscolares("Libro perdido", datos)).detalle);
      await obtenerPool().query("UPDATE MULTAS SET aviso_tesoreria = $2 WHERE id_multa = $1", [reposicion.id, !seguimiento.tesoreria.startsWith("Pendiente")]);
    }
    return { idPrestamo, condicion, estadoEjemplar, multas, total: multas.reduce((s, m) => s + m.montoMxn, 0), tipoCambio, seguimiento };
  }
}

@Controller("api/devoluciones")
export class ControladorDevoluciones {
  constructor(private readonly devoluciones: ServicioDevoluciones) {}
  @Get(":idPrestamo/vista-previa") vistaPrevia(@Param("idPrestamo", ParseIntPipe) id: number, @Query() q: CondicionDto) { return this.devoluciones.vistaPrevia(id, q.condicion); }
  @Post() devolver(@Body() d: DevolucionDto, @UsuarioActual() autor: Sesion) { return this.devoluciones.devolver(d.idPrestamo, d.condicion, autor); }
}

@Module({ controllers: [ControladorDevoluciones], providers: [ServicioDevoluciones] })
export class ModuloDevolverLibros {}

if (require.main === module) void iniciarServicio(ModuloDevolverLibros, "devolver-libros", PUERTOS["devolver-libros"]);
