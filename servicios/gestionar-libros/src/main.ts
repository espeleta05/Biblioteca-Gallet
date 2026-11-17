/**
 * Microservicio "Gestionar libros" (Sprint 1): alta, baja, cambio y consulta de
 * libros (HU1–HU4-SP1), compra de libros con presupuesto (HU5-SP1), listado por
 * filtros para inventario (HU6-SP1), ubicaciones y solicitudes de compra.
 */
import "reflect-metadata";
import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import type { Sesion } from "../../comun/auth";
import { PUERTOS } from "../../comun/config";
import { iniciarServicio, UsuarioActual } from "../../comun/nest";
import {
  BajaEjemplarDto, CambioEjemplarDto, CambiosFichaDto, CambioUbicacionDto, DecisionSolicitudDto, FiltroInventarioDto, FiltroLibrosDto, NuevaFichaDto,
  NuevaUbicacionDto, NuevosEjemplaresDto, OrdenCompraDto, PresupuestoDto, RecepcionDto, SolicitudCompraDto,
} from "./dto";
import { ServicioLibros } from "./servicio";

@Controller("api/libros")
export class ControladorLibros {
  constructor(private readonly libros: ServicioLibros) {}

  // Rutas fijas antes de ":id".
  @Get() listar(@Query() filtro: FiltroLibrosDto) { return this.libros.listar(filtro); }
  @Get("catalogos") catalogos() { return this.libros.catalogos(); }
  @Get("consulta") consulta(@Query("dato") dato?: string) { return this.libros.consultarPorDato(dato); }
  @Get("inventario") inventario(@Query() filtro: FiltroInventarioDto) { return this.libros.inventario(filtro); }
  @Get("avisos") avisos() { return this.libros.avisos(); }
  @Post("ubicaciones") ubicacion(@Body() datos: NuevaUbicacionDto, @UsuarioActual() autor: Sesion) { return this.libros.registrarUbicacion(datos, autor); }
  @Post("ejemplares/baja") @HttpCode(200) baja(@Body() datos: BajaEjemplarDto, @UsuarioActual() autor: Sesion) { return this.libros.darDeBajaEjemplar(datos, autor); }
  @Post() crear(@Body() datos: NuevaFichaDto, @UsuarioActual() autor: Sesion) { return this.libros.crear(datos, autor); }

  @Get(":id") ficha(@Param("id", ParseIntPipe) id: number) { return this.libros.ficha(id); }
  @Get(":id/historial") historial(@Param("id", ParseIntPipe) id: number) { return this.libros.historial(id); }
  @Patch(":id") actualizar(@Param("id", ParseIntPipe) id: number, @Body() cambios: CambiosFichaDto, @UsuarioActual() autor: Sesion) { return this.libros.actualizar(id, cambios, autor); }
  @Patch(":id/ubicacion") moverLibro(@Param("id", ParseIntPipe) id: number, @Body() datos: CambioUbicacionDto, @UsuarioActual() autor: Sesion) { return this.libros.cambiarUbicacion(id, datos.ubicacion, autor); }
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

@Controller("api/compras")
export class ControladorCompras {
  constructor(private readonly libros: ServicioLibros) {}

  @Get("presupuesto") presupuesto() { return this.libros.presupuesto(); }
  @Patch("presupuesto") fijar(@Body() datos: PresupuestoDto, @UsuarioActual() autor: Sesion) { return this.libros.fijarPresupuesto(datos.montoMxn, autor); }
  @Get() ordenes() { return this.libros.ordenes(); }
  @Post() registrar(@Body() datos: OrdenCompraDto, @UsuarioActual() autor: Sesion) { return this.libros.registrarOrden(datos, autor); }
  @Post(":id/recepcion") @HttpCode(200) recibir(@Param("id", ParseIntPipe) id: number, @Body() datos: RecepcionDto, @UsuarioActual() autor: Sesion) { return this.libros.recibirOrden(id, datos, autor); }
}

@Module({ controllers: [ControladorLibros, ControladorSolicitudes, ControladorCompras], providers: [ServicioLibros] })
export class ModuloGestionarLibros {}

if (require.main === module) void iniciarServicio(ModuloGestionarLibros, "gestionar-libros", PUERTOS["gestionar-libros"]);
