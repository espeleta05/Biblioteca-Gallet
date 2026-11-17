import { Body, Controller, Delete, Get, Headers, HttpCode, HttpException, Param, ParseIntPipe, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { COOKIE_SESION, evaluarAcceso, extraerToken, jsonAscii, verificarToken, type Sesion } from "../../comun/auth";
import { config } from "../../comun/config";
import { UsuarioActual } from "../../comun/nest";
import { AsignarPerfilDto, BajaCuentaDto, CambiosCuentaDto, FiltroUsuariosDto, InicioSesionDto, NuevaCuentaDto, NuevoPerfilDto } from "./dto";
import { ServicioUsuarios } from "./servicio";

@Controller("api/auth")
export class ControladorAuth {
  constructor(private readonly usuarios: ServicioUsuarios) {}

  /** Inicio de sesión. La web recibe cookie httpOnly; la app móvil usa el token. */
  @Post("sesion")
  @HttpCode(200)
  async iniciar(@Body() datos: InicioSesionDto, @Res({ passthrough: true }) respuesta: Response) {
    const { sesion, token } = await this.usuarios.iniciarSesion(datos.identificador, datos.contrasena);
    respuesta.cookie(COOKIE_SESION, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: config.horasSesion * 3_600_000 });
    return { sesion, token, mensaje: `Bienvenido(a), ${sesion.nombre}.` };
  }

  @Get("sesion")
  async actual(@Req() solicitud: Request) {
    const token = extraerToken(solicitud.headers as { authorization?: string; cookie?: string }, solicitud.cookies);
    const sesion = token ? await verificarToken(token) : null;
    return { sesion: sesion && (await this.usuarios.cuentaActiva(sesion.id)) ? sesion : null };
  }

  @Delete("sesion")
  cerrar(@Res({ passthrough: true }) respuesta: Response) {
    respuesta.clearCookie(COOKIE_SESION, { path: "/" });
    return { ok: true };
  }

  /** Mi cuenta: datos, perfil, préstamos activos y multas pendientes de quien inició sesión. */
  @Get("cuenta") miCuenta(@UsuarioActual() sesion: Sesion) { return this.usuarios.miCuenta(sesion); }
  /** HU4-SP0, escenario 4: el usuario no puede cambiar sus propios datos. */
  @Patch("cuenta") editarMiCuenta(@UsuarioActual() sesion: Sesion) { return this.usuarios.editarMiCuenta(sesion); }

  /**
   * Endpoint para el API Gateway (NGINX auth_request): valida la identidad, que la
   * cuenta siga activa y el permiso para la ruta original antes de enrutar al
   * microservicio. El mensaje de rechazo viaja en X-Mensaje para que NGINX lo muestre.
   */
  @Get("verificar")
  async verificar(@Headers("x-original-uri") rutaOriginal: string | undefined, @Headers("x-original-method") metodo: string | undefined,
    @Req() solicitud: Request, @Res({ passthrough: true }) respuesta: Response) {
    const token = extraerToken(solicitud.headers as { authorization?: string; cookie?: string }, solicitud.cookies);
    const sesion = token ? await verificarToken(token) : null;
    const rechazar = (estado: 401 | 403, mensaje: string) => {
      respuesta.setHeader("X-Mensaje", jsonAscii(mensaje));
      throw new HttpException({ error: mensaje }, estado);
    };
    // Sesiones de una cuenta dada de baja quedan cerradas (HU3-SP0).
    if (sesion && sesion.rol !== "Servicio" && !(await this.usuarios.cuentaActiva(sesion.id))) rechazar(401, "Tu sesión se cerró porque la cuenta está dada de baja.");
    const acceso = evaluarAcceso(rutaOriginal ?? "/", sesion, metodo);
    if (!acceso.permitido) rechazar(acceso.estado, acceso.mensaje);
    respuesta.setHeader("X-Usuario-Id", String(sesion?.id ?? ""));
    respuesta.setHeader("X-Usuario-Rol", encodeURIComponent(sesion?.rol ?? ""));
    return { ok: true };
  }
}

@Controller("api/usuarios")
export class ControladorUsuarios {
  constructor(private readonly usuarios: ServicioUsuarios) {}

  @Get() listar(@Query() filtro: FiltroUsuariosDto) { return this.usuarios.listar(filtro); }
  @Post() crear(@Body() datos: NuevaCuentaDto, @UsuarioActual() autor: Sesion) { return this.usuarios.crearCuenta(datos, autor); }
  @Post("bajas") @HttpCode(200) baja(@Body() datos: BajaCuentaDto, @UsuarioActual() autor: Sesion) { return this.usuarios.darDeBaja(datos, autor); }
  @Post("sincronizacion") sincronizar(@UsuarioActual() autor: Sesion) { return this.usuarios.sincronizarConBaseEscolar(autor); }
  @Get(":id/historial") historial(@Param("id", ParseIntPipe) id: number) { return this.usuarios.historial(id); }
  @Patch(":id") actualizar(@Param("id", ParseIntPipe) id: number, @Body() cambios: CambiosCuentaDto, @UsuarioActual() autor: Sesion) { return this.usuarios.actualizar(id, cambios, autor); }
}

@Controller("api/perfiles")
export class ControladorPerfiles {
  constructor(private readonly usuarios: ServicioUsuarios) {}

  @Get() listar() { return this.usuarios.perfiles(); }
  @Post() crear(@Body() datos: NuevoPerfilDto, @UsuarioActual() autor: Sesion) { return this.usuarios.crearPerfil(datos, autor); }
  @Post("asignaciones") @HttpCode(200) asignar(@Body() datos: AsignarPerfilDto, @UsuarioActual() autor: Sesion) { return this.usuarios.asignarPerfil(datos, autor); }
  @Delete(":id") eliminar(@Param("id", ParseIntPipe) id: number, @UsuarioActual() autor: Sesion) { return this.usuarios.eliminarPerfil(id, autor); }
}
