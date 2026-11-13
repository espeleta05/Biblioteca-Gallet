/**
 * Microservicio "Alumnos suspendidos" (Sprint 3): registra a quienes ya no se
 * les puede prestar por exceso de multas, robo o mal uso de los libros, y envía
 * la lista a Servicios Escolares.
 */
import "reflect-metadata";
import { Body, Controller, Get, Injectable, Module, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from "class-validator";
import type { Sesion } from "../../comun/auth";
import { PUERTOS } from "../../comun/config";
import { consultar, consultarUno, enTransaccion, obtenerPool, registrarEnBitacora } from "../../comun/db";
import { hoyEnBiblioteca } from "../../comun/dominio/fechas";
import { motivoSuspensionAutomatica, type MotivoMulta } from "../../comun/dominio/multas";
import { avisarServiciosEscolares } from "../../comun/integraciones";
import { ErrorDeNegocio, iniciarServicio, NoEncontrado, UsuarioActual } from "../../comun/nest";

type Causa = "Exceso de multas" | "Robo" | "Mal uso";

export class SuspensionDto {
  @IsInt() @Min(1) idCredencial!: number;
  @IsIn(["Exceso de multas", "Robo", "Mal uso"]) causa!: Causa;
  @IsString() @Length(10, 255, { message: "Describe el motivo de la suspensión (mínimo 10 caracteres)." }) detalle!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "La fecha de fin debe tener el formato AAAA-MM-DD." }) fechaFin?: string;
}
export class EvaluacionDto {
  @IsInt() @Min(1) idCredencial!: number;
  @IsOptional() @IsIn(["Retraso", "Daño", "Pérdida", "Robo"]) motivoNuevaMulta?: MotivoMulta;
}
export class FiltroSuspensionesDto { @IsOptional() @IsIn(["Activa", "Levantada"]) estado?: string; }

@Injectable()
export class ServicioSuspensiones {
  listar(estado?: string) {
    return consultar(`
      SELECT s.id_suspension AS id, s.causa, s.detalle, s.origen, s.fecha_inicio AS "fechaInicio", s.fecha_fin AS "fechaFin", s.estado,
             s.aviso_servicios_escolares AS "avisoServiciosEscolares", c.id_credencial AS "idCredencial", c.matricula_nomina AS identificador,
             ue.nombre_completo AS persona, ue.tipo
      FROM SUSPENSIONES s JOIN CREDENCIALES c ON c.id_credencial = s.id_credencial LEFT JOIN USUARIOS_ESCOLARES ue ON ue.id_credencial = c.id_credencial
      WHERE ($1::text IS NULL OR s.estado = $1) ORDER BY s.estado, s.fecha_inicio DESC`, [estado ?? null]);
  }

  private async registrar(idCredencial: number, causa: Causa, detalle: string, origen: "Automática" | "Manual", fechaFin: string | null, autor?: Sesion) {
    const persona = await consultarUno<{ identificador: string; nombre: string | null; tipo: string | null }>(`
      SELECT c.matricula_nomina AS identificador, ue.nombre_completo AS nombre, ue.tipo FROM CREDENCIALES c
      LEFT JOIN USUARIOS_ESCOLARES ue ON ue.id_credencial = c.id_credencial WHERE c.id_credencial = $1`, [idCredencial]);
    if (!persona?.tipo) throw new NoEncontrado("El alumno, profesor o colaborador");
    const id = await enTransaccion(async (cliente) => {
      const activa = await consultarUno("SELECT 1 FROM SUSPENSIONES WHERE id_credencial = $1 AND estado = 'Activa' FOR UPDATE", [idCredencial], cliente);
      if (activa) throw new ErrorDeNegocio(`${persona.nombre} ya tiene una suspensión activa.`);
      const fila = await consultarUno<{ id_suspension: number }>(`
        INSERT INTO SUSPENSIONES (id_credencial, causa, detalle, origen, fecha_inicio, fecha_fin) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_suspension`,
        [idCredencial, causa, detalle, origen, hoyEnBiblioteca(), fechaFin], cliente);
      await registrarEnBitacora(cliente, "alumnos-suspendidos", `Suspensión ${origen.toLowerCase()}`, `${persona.identificador}: ${causa} · ${detalle}`, autor?.id);
      return fila!.id_suspension;
    });
    const aviso = await avisarServiciosEscolares("Suspensión", { identificador: persona.identificador, nombre: persona.nombre, causa, detalle });
    await obtenerPool().query("UPDATE SUSPENSIONES SET aviso_servicios_escolares = $2 WHERE id_suspension = $1", [id, aviso.estado === "Enviado"]);
    return { id, avisoServiciosEscolares: aviso };
  }

  /** Registro manual (incluye "mal uso", que requiere el criterio del personal). */
  suspender(d: SuspensionDto, autor: Sesion) {
    return this.registrar(d.idCredencial, d.causa, d.detalle.trim(), "Manual", d.fechaFin ?? null, autor);
  }

  /** Llamada interna de Devolver libros: suspende por robo o por exceso de multas. */
  async evaluar(d: EvaluacionDto) {
    const { pendientes } = (await consultarUno<{ pendientes: number }>("SELECT COUNT(*)::int AS pendientes FROM MULTAS WHERE id_credencial = $1 AND estatus = 'Pendiente'", [d.idCredencial]))!;
    const yaSuspendido = await consultarUno("SELECT 1 FROM SUSPENSIONES WHERE id_credencial = $1 AND estado = 'Activa'", [d.idCredencial]);
    const causa = motivoSuspensionAutomatica({ multasPendientes: pendientes, motivoNuevaMulta: d.motivoNuevaMulta });
    if (!causa || yaSuspendido) return { suspendido: Boolean(yaSuspendido), causa: yaSuspendido ? "ya estaba suspendido" : undefined };
    await this.registrar(d.idCredencial, causa.startsWith("Robo") ? "Robo" : "Exceso de multas", causa, "Automática", null);
    return { suspendido: true, causa };
  }

  async levantar(id: number, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const s = await consultarUno<{ id_credencial: number; causa: Causa }>("SELECT id_credencial, causa FROM SUSPENSIONES WHERE id_suspension = $1 AND estado = 'Activa' FOR UPDATE", [id], cliente);
      if (!s) throw new ErrorDeNegocio("La suspensión no existe o ya fue levantada.");
      if (s.causa === "Exceso de multas") {
        const { pendientes } = (await consultarUno<{ pendientes: number }>("SELECT COUNT(*)::int AS pendientes FROM MULTAS WHERE id_credencial = $1 AND estatus = 'Pendiente'", [s.id_credencial], cliente))!;
        if (pendientes > 0) throw new ErrorDeNegocio(`No se levanta la suspensión: aún hay ${pendientes} multa(s) pendiente(s).`);
      }
      await cliente.query("UPDATE SUSPENSIONES SET estado = 'Levantada', fecha_fin = $2 WHERE id_suspension = $1", [id, hoyEnBiblioteca()]);
      await registrarEnBitacora(cliente, "alumnos-suspendidos", "Suspensión levantada", `suspensión ${id}`, autor.id);
      return { ok: true };
    });
  }
}

@Controller("api/suspensiones")
export class ControladorSuspensiones {
  constructor(private readonly suspensiones: ServicioSuspensiones) {}
  @Get() listar(@Query() f: FiltroSuspensionesDto) { return this.suspensiones.listar(f.estado); }
  @Post() suspender(@Body() d: SuspensionDto, @UsuarioActual() autor: Sesion) { return this.suspensiones.suspender(d, autor); }
  @Post("evaluaciones") evaluar(@Body() d: EvaluacionDto) { return this.suspensiones.evaluar(d); }
  @Patch(":id/levantamiento") levantar(@Param("id", ParseIntPipe) id: number, @UsuarioActual() autor: Sesion) { return this.suspensiones.levantar(id, autor); }
}

@Module({ controllers: [ControladorSuspensiones], providers: [ServicioSuspensiones] })
export class ModuloAlumnosSuspendidos {}

if (require.main === module) void iniciarServicio(ModuloAlumnosSuspendidos, "alumnos-suspendidos", PUERTOS["alumnos-suspendidos"]);
