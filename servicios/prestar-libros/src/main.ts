/**
 * Microservicio "Prestar libros" (Sprint 2): validación del solicitante y del
 * libro, registro del préstamo, recibo (correo, WhatsApp o impresión),
 * renovación y gestión de la lista de espera.
 */
import "reflect-metadata";
import { Body, Controller, Get, Module, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from "class-validator";
import type { Sesion } from "../../comun/auth";
import { PUERTOS } from "../../comun/config";
import type { Canal } from "../../comun/integraciones";
import { iniciarServicio, UsuarioActual } from "../../comun/nest";
import { ServicioPrestamos } from "./servicio";

const CANALES: Canal[] = ["Correo", "WhatsApp", "Impresión"];

export class NuevoPrestamoDto {
  @IsInt() @Min(1) idSolicitante!: number;
  @IsInt() @Min(1) idLibro!: number;
  @IsIn(CANALES, { message: "El recibo se entrega por Correo, WhatsApp o Impresión." }) canalRecibo!: Canal;
}
export class CanalDto { @IsIn(CANALES) canal!: Canal; }
export class EsperaDto { @IsInt() @Min(1) idSolicitante!: number; @IsInt() @Min(1) idLibro!: number; }
export class AvisoEsperaDto { @IsInt() @Min(1) idLibro!: number; }
export class FiltroPrestamosDto { @IsOptional() @IsIn(["Activo", "Devuelto"]) estado?: string; @IsOptional() @IsString() q?: string; }
export class TextoDto { @IsString() q!: string; }
export class FiltroEsperaDto { @IsOptional() @Matches(/^\d+$/) idLibro?: string; }

@Controller("api/prestamos")
export class ControladorPrestamos {
  constructor(private readonly prestamos: ServicioPrestamos) {}
  @Get() listar(@Query() f: FiltroPrestamosDto) { return this.prestamos.listar(f.estado, f.q); }
  @Get("solicitantes") solicitantes(@Query() f: TextoDto) { return this.prestamos.buscarSolicitantes(f.q); }
  @Get("libros") libros(@Query() f: TextoDto) { return this.prestamos.buscarLibros(f.q); }
  @Post() prestar(@Body() d: NuevoPrestamoDto, @UsuarioActual() autor: Sesion) { return this.prestamos.prestar(d.idSolicitante, d.idLibro, d.canalRecibo, autor); }
  @Post(":id/renovaciones") renovar(@Param("id", ParseIntPipe) id: number, @UsuarioActual() autor: Sesion) { return this.prestamos.renovar(id, autor); }
}

@Controller("api/recibos")
export class ControladorRecibos {
  constructor(private readonly prestamos: ServicioPrestamos) {}
  @Get(":folio") ver(@Param("folio") folio: string) { return this.prestamos.recibo(folio); }
  @Post(":folio/envios") reenviar(@Param("folio") folio: string, @Body() d: CanalDto) { return this.prestamos.reenviarRecibo(folio, d.canal); }
}

@Controller("api/lista-espera")
export class ControladorListaEspera {
  constructor(private readonly prestamos: ServicioPrestamos) {}
  @Get() listar(@Query() f: FiltroEsperaDto) { return this.prestamos.listaEspera(f.idLibro ? Number(f.idLibro) : undefined); }
  @Post() registrar(@Body() d: EsperaDto, @UsuarioActual() autor: Sesion) { return this.prestamos.registrarEspera(d.idSolicitante, d.idLibro, autor); }
  @Patch(":id/cancelacion") cancelar(@Param("id", ParseIntPipe) id: number, @UsuarioActual() autor: Sesion) { return this.prestamos.cancelarEspera(id, autor); }
  @Post("avisos") avisar(@Body() d: AvisoEsperaDto) { return this.prestamos.avisarPrimeroEnEspera(d.idLibro); }
}

@Module({ controllers: [ControladorPrestamos, ControladorRecibos, ControladorListaEspera], providers: [ServicioPrestamos] })
export class ModuloPrestarLibros {}

if (require.main === module) void iniciarServicio(ModuloPrestarLibros, "prestar-libros", PUERTOS["prestar-libros"]);
