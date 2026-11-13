/**
 * Microservicio "Gestionar libros" (Sprint 1): ficha bibliográfica, estado y
 * ubicación de ejemplares, listado por filtros y solicitud de compra.
 */
import "reflect-metadata";
import { Body, Controller, Delete, Get, Module, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import type { Sesion } from "../../comun/auth";
import { PUERTOS } from "../../comun/config";
import { iniciarServicio, UsuarioActual } from "../../comun/nest";
import { CambioEjemplarDto, CambiosFichaDto, DecisionSolicitudDto, FiltroLibrosDto, NuevaFichaDto, NuevosEjemplaresDto, SolicitudCompraDto } from "./dto";
import { ServicioLibros } from "./servicio";

@Controller("api/libros")
export class ControladorLibros {
  constructor(private readonly libros: ServicioLibros) {}

  @Get() listar(@Query() filtro: FiltroLibrosDto) { return this.libros.listar(filtro); }
  @Get("catalogos") catalogos() { return this.libros.catalogos(); }
  @Get(":id") ficha(@Param("id", ParseIntPipe) id: number) { return this.libros.ficha(id); }
  @Post() crear(@Body() datos: NuevaFichaDto, @UsuarioActual() autor: Sesion) { return this.libros.crear(datos, autor); }
  @Patch(":id") actualizar(@Param("id", ParseIntPipe) id: number, @Body() cambios: CambiosFichaDto, @UsuarioActual() autor: Sesion) { return this.libros.actualizar(id, cambios, autor); }
  @Delete(":id") eliminar(@Param("id", ParseIntPipe) id: number, @UsuarioActual() autor: Sesion) { return this.libros.eliminar(id, autor); }
  @Post(":id/ejemplares") agregar(@Param("id", ParseIntPipe) id: number, @Body() datos: NuevosEjemplaresDto, @UsuarioActual() autor: Sesion) { return this.libros.nuevosEjemplares(id, datos, autor); }
  @Patch(":id/ejemplares/:idEjemplar")
  cambiarEjemplar(@Param("id", ParseIntPipe) id: number, @Param("idEjemplar", ParseIntPipe) idEjemplar: number, @Body() cambio: CambioEjemplarDto, @UsuarioActual() autor: Sesion) {
    return this.libros.cambiarEjemplar(id, idEjemplar, cambio, autor);
  }
}

@Controller("api/solicitudes-compra")
export class ControladorSolicitudes {
  constructor(private readonly libros: ServicioLibros) {}

  @Get() listar() { return this.libros.solicitudes(); }
  @Post() crear(@Body() datos: SolicitudCompraDto, @UsuarioActual() autor: Sesion) { return this.libros.solicitarCompra(datos, autor); }
  @Patch(":id") decidir(@Param("id", ParseIntPipe) id: number, @Body() datos: DecisionSolicitudDto, @UsuarioActual() autor: Sesion) { return this.libros.decidirSolicitud(id, datos.estatus, autor); }
}

@Module({ controllers: [ControladorLibros, ControladorSolicitudes], providers: [ServicioLibros] })
export class ModuloGestionarLibros {}

if (require.main === module) void iniciarServicio(ModuloGestionarLibros, "gestionar-libros", PUERTOS["gestionar-libros"]);
