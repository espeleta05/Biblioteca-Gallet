/**
 * Microservicio "Gestión de multas" (Sprint 3): validar fechas de préstamos,
 * calcular multas (Regla 3) y costo de reposición (Regla 4), avisos de adeudos,
 * registro de pagos confirmados por Tesorería, recibos de pago, revocación y
 * lista de personas con adeudos.
 */
import "reflect-metadata";
import { Body, Controller, Get, Injectable, Module, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
import { IsIn, IsNumber, IsOptional, IsString, Length, Min } from "class-validator";
import type { Sesion } from "../../comun/auth";
import { enviarYRegistrar, formatoPesos } from "../../comun/avisos";
import { PUERTOS } from "../../comun/config";
import { consultar, consultarUno, enTransaccion, obtenerPool, registrarEnBitacora } from "../../comun/db";
import { diasDeRetraso, hoyEnBiblioteca } from "../../comun/dominio/fechas";
import { multaPorRetraso } from "../../comun/dominio/multas";
import { confirmarPagoTesoreria, type Canal } from "../../comun/integraciones";
import { ErrorDeNegocio, iniciarServicio, NoEncontrado, UsuarioActual } from "../../comun/nest";
import { tipoCambioVigente } from "../../comun/tipo-cambio";

const CANALES: Canal[] = ["Correo", "WhatsApp", "Impresión"];
export const folioPago = (id: number) => `M-${String(id).padStart(6, "0")}`;

export class PagoDto {
  @IsString() @Length(4, 60, { message: "Captura la referencia de pago que entrega Tesorería." }) referenciaTesoreria!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) montoMxn!: number;
  @IsIn(CANALES) canalRecibo!: Canal;
}
export class RevocacionDto { @IsString() @Length(10, 255, { message: "Explica el motivo de la revocación (mínimo 10 caracteres)." }) motivo!: string; }
export class FiltroMultasDto { @IsOptional() @IsIn(["Pendiente", "Pagada", "Revocada"]) estatus?: string; @IsOptional() @IsString() q?: string; }
export class AvisoAdeudosDto { @IsIn(["Correo", "WhatsApp"]) canal!: "Correo" | "WhatsApp"; }

@Injectable()
export class ServicioMultas {
  listar(f: FiltroMultasDto) {
    return consultar(`
      SELECT m.id_multa AS id, m.motivo, m.monto_mxn AS "montoMxn", m.dias_retraso AS "diasRetraso", m.tipo_cambio AS "tipoCambio", m.estatus,
             m.fecha_generacion AS fecha, m.motivo_revocacion AS "motivoRevocacion", m.aviso_tesoreria AS "avisoTesoreria",
             c.matricula_nomina AS identificador, ue.nombre_completo AS persona, ue.tipo, l.titulo, m.id_prestamo AS "idPrestamo",
             pg.referencia_tesoreria AS "referenciaPago", CASE WHEN pg.id_pago IS NULL THEN NULL ELSE 'M-' || LPAD(pg.id_pago::text, 6, '0') END AS "folioRecibo"
      FROM MULTAS m JOIN CREDENCIALES c ON c.id_credencial = m.id_credencial
      LEFT JOIN USUARIOS_ESCOLARES ue ON ue.id_credencial = c.id_credencial
      JOIN PRESTAMOS p ON p.id_prestamo = m.id_prestamo JOIN EJEMPLARES e ON e.id_ejemplar = p.id_ejemplar JOIN LIBROS l ON l.id_libro = e.id_libro
      LEFT JOIN PAGOS pg ON pg.id_multa = m.id_multa
      WHERE ($1::text IS NULL OR m.estatus = $1)
        AND ($2::text IS NULL OR CONCAT_WS(' ', c.matricula_nomina, ue.nombre_completo, l.titulo) ILIKE '%' || $2 || '%')
      ORDER BY m.fecha_generacion DESC LIMIT 500`, [f.estatus ?? null, f.q?.trim() || null]);
  }

  /** Validar las fechas de los préstamos: préstamos activos vencidos y la multa que llevan acumulada. */
  async prestamosVencidos() {
    const hoy = hoyEnBiblioteca();
    const filas = await consultar<{ id: number; vencimiento: string; identificador: string; persona: string; titulo: string }>(`
      SELECT p.id_prestamo AS id, p.fecha_vencimiento AS vencimiento, c.matricula_nomina AS identificador, ue.nombre_completo AS persona, l.titulo
      FROM PRESTAMOS p JOIN CREDENCIALES c ON c.id_credencial = p.id_credencial LEFT JOIN USUARIOS_ESCOLARES ue ON ue.id_credencial = c.id_credencial
      JOIN EJEMPLARES e ON e.id_ejemplar = p.id_ejemplar JOIN LIBROS l ON l.id_libro = e.id_libro
      WHERE p.estado = 'Activo' AND p.fecha_vencimiento < $1 ORDER BY p.fecha_vencimiento`, [hoy]);
    return filas.map((f) => ({ ...f, diasRetraso: diasDeRetraso(f.vencimiento, hoy), multaAcumuladaMxn: multaPorRetraso(f.vencimiento, hoy) }));
  }

  /** Registrar el pago: Tesorería confirma la referencia antes de liquidar la multa. */
  async pagar(idMulta: number, datos: PagoDto, autor: Sesion) {
    const multa = await consultarUno<{ estatus: string; monto_mxn: number; id_credencial: number; identificador: string; motivo: string }>(`
      SELECT m.estatus, m.monto_mxn, m.id_credencial, c.matricula_nomina AS identificador, m.motivo
      FROM MULTAS m JOIN CREDENCIALES c ON c.id_credencial = m.id_credencial WHERE m.id_multa = $1`, [idMulta]);
    if (!multa) throw new NoEncontrado("La multa");
    if (multa.estatus !== "Pendiente") throw new ErrorDeNegocio(`La multa ya está ${multa.estatus.toLowerCase()}.`);
    if (Math.abs(datos.montoMxn - multa.monto_mxn) > 0.009) {
      throw new ErrorDeNegocio("El monto pagado no coincide con la multa.", [`Multa: ${formatoPesos(multa.monto_mxn)}; pagado: ${formatoPesos(datos.montoMxn)}.`]);
    }
    const tesoreria = await confirmarPagoTesoreria(datos.referenciaTesoreria, datos.montoMxn, multa.identificador);
    if (!tesoreria.confirmado) throw new ErrorDeNegocio("Tesorería no confirmó el pago.", [tesoreria.detalle]);

    const recibo = await enTransaccion(async (cliente) => {
      const bloqueada = await consultarUno<{ estatus: string }>("SELECT estatus FROM MULTAS WHERE id_multa = $1 FOR UPDATE", [idMulta], cliente);
      if (bloqueada?.estatus !== "Pendiente") throw new ErrorDeNegocio("La multa se liquidó en otra operación.");
      const pago = await consultarUno<{ id_pago: number }>(
        "INSERT INTO PAGOS (id_multa, monto_pagado_mxn, referencia_tesoreria, id_credencial_registra) VALUES ($1, $2, $3, $4) RETURNING id_pago",
        [idMulta, datos.montoMxn, datos.referenciaTesoreria, autor.id], cliente);
      await cliente.query("UPDATE MULTAS SET estatus = 'Pagada' WHERE id_multa = $1", [idMulta]);
      const folio = folioPago(pago!.id_pago);
      const contenido = [`SIGEB · Biblioteca Universidad Ducky`, `Recibo de pago ${folio}`, `Fecha: ${hoyEnBiblioteca()}`, `Usuario: ${multa.identificador}`,
        `Concepto: multa #${idMulta} por ${multa.motivo.toLowerCase()}`, `Monto: ${formatoPesos(datos.montoMxn)}`, `Referencia de Tesorería: ${datos.referenciaTesoreria}`].join("\n");
      await cliente.query("INSERT INTO RECIBOS (folio, tipo, id_referencia, id_credencial, contenido) VALUES ($1, 'Pago', $2, $3, $4)", [folio, pago!.id_pago, multa.id_credencial, contenido]);
      await registrarEnBitacora(cliente, "gestion-multas", "Pago registrado", `${folio} · multa ${idMulta} · ${formatoPesos(datos.montoMxn)} · ref ${datos.referenciaTesoreria}`, autor.id);
      return { folio, contenido };
    });
    const envio = await enviarYRegistrar({ idCredencial: multa.id_credencial, tipo: "Recibo de pago", canal: datos.canalRecibo, asunto: `Recibo de pago ${recibo.folio}`, mensaje: recibo.contenido });
    return { ...recibo, envio };
  }

  async revocar(idMulta: number, motivo: string, autor: Sesion) {
    if (autor.rol !== "Administrador") throw new ErrorDeNegocio("Solo el Administrador de biblioteca puede revocar multas.");
    return enTransaccion(async (cliente) => {
      const r = await cliente.query("UPDATE MULTAS SET estatus = 'Revocada', motivo_revocacion = $2, id_credencial_revoca = $3 WHERE id_multa = $1 AND estatus = 'Pendiente'", [idMulta, motivo.trim(), autor.id]);
      if (!r.rowCount) throw new ErrorDeNegocio("Solo se revoca una multa pendiente.");
      await registrarEnBitacora(cliente, "gestion-multas", "Multa revocada", `multa ${idMulta}: ${motivo}`, autor.id);
      return { ok: true };
    });
  }

  /** Creación de lista de personas con adeudos (para Servicios Escolares en época de exámenes). */
  adeudos() {
    return consultar(`
      SELECT c.id_credencial AS "idCredencial", c.matricula_nomina AS identificador, ue.nombre_completo AS persona, ue.tipo,
             ue.correo_institucional AS correo, ue.telefono, COUNT(m.id_multa)::int AS multas, SUM(m.monto_mxn)::numeric(10,2) AS "totalMxn",
             MIN(m.fecha_generacion) AS "desde",
             EXISTS (SELECT 1 FROM SUSPENSIONES s WHERE s.id_credencial = c.id_credencial AND s.estado = 'Activa') AS suspendido
      FROM MULTAS m JOIN CREDENCIALES c ON c.id_credencial = m.id_credencial LEFT JOIN USUARIOS_ESCOLARES ue ON ue.id_credencial = c.id_credencial
      WHERE m.estatus = 'Pendiente'
      GROUP BY c.id_credencial, ue.nombre_completo, ue.tipo, ue.correo_institucional, ue.telefono
      ORDER BY "totalMxn" DESC`);
  }

  /** Avisos de adeudos a cada persona con multas pendientes. */
  async avisarAdeudos(canal: "Correo" | "WhatsApp", autor: Sesion) {
    const deudores = await this.adeudos() as Array<{ idCredencial: number; persona: string; multas: number; totalMxn: number }>;
    const resultados = [];
    for (const d of deudores) {
      try {
        const envio = await enviarYRegistrar({ idCredencial: d.idCredencial, tipo: "Aviso de adeudo", canal, asunto: "Aviso de adeudo en la Biblioteca",
          mensaje: `Hola ${d.persona}: tienes ${d.multas} multa(s) pendiente(s) por ${formatoPesos(d.totalMxn)}. Paga en Tesorería; mientras tengas adeudos no podrás recibir préstamos.` });
        resultados.push({ persona: d.persona, estado: envio.estado });
      } catch (error) {
        resultados.push({ persona: d.persona, estado: "Fallido", detalle: (error as Error).message });
      }
    }
    await registrarEnBitacora(obtenerPool(), "gestion-multas", "Avisos de adeudo", `${resultados.length} aviso(s) por ${canal}`, autor.id);
    return { enviados: resultados.length, resultados };
  }
}

@Controller("api/multas")
export class ControladorMultas {
  constructor(private readonly multas: ServicioMultas) {}
  @Get() listar(@Query() f: FiltroMultasDto) { return this.multas.listar(f); }
  @Get("prestamos-vencidos") vencidos() { return this.multas.prestamosVencidos(); }
  @Post(":id/pagos") pagar(@Param("id", ParseIntPipe) id: number, @Body() d: PagoDto, @UsuarioActual() autor: Sesion) { return this.multas.pagar(id, d, autor); }
  @Post(":id/revocacion") revocar(@Param("id", ParseIntPipe) id: number, @Body() d: RevocacionDto, @UsuarioActual() autor: Sesion) { return this.multas.revocar(id, d.motivo, autor); }
}

@Controller("api/adeudos")
export class ControladorAdeudos {
  constructor(private readonly multas: ServicioMultas) {}
  @Get() listar() { return this.multas.adeudos(); }
  @Post("avisos") avisar(@Body() d: AvisoAdeudosDto, @UsuarioActual() autor: Sesion) { return this.multas.avisarAdeudos(d.canal, autor); }
}

@Controller("api/tipo-cambio")
export class ControladorTipoCambio {
  @Get() vigente() { return tipoCambioVigente(); }
}

@Module({ controllers: [ControladorMultas, ControladorAdeudos, ControladorTipoCambio], providers: [ServicioMultas] })
export class ModuloGestionMultas {}

if (require.main === module) void iniciarServicio(ModuloGestionMultas, "gestion-multas", PUERTOS["gestion-multas"]);
