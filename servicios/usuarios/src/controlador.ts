import { Body, Controller, Delete, Get, Headers, HttpCode, HttpException, Param, ParseIntPipe, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { COOKIE_SESION, evaluarAcceso, extraerToken, verificarToken, type Sesion } from "../../comun/auth";
import { config } from "../../comun/config";
import { UsuarioActual } from "../../comun/nest";
import { CambiosUsuarioDto, FiltroUsuariosDto, InicioSesionDto, NuevoPersonalDto } from "./dto";
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
    return { sesion, token };
  }

  @Get("sesion")
  async actual(@Req() solicitud: Request) {
    const token = extraerToken(solicitud.headers as { authorization?: string; cookie?: string }, solicitud.cookies);
    return { sesion: token ? await verificarToken(token) : null };
  }

  @Delete("sesion")
  cerrar(@Res({ passthrough: true }) respuesta: Response) {
    respuesta.clearCookie(COOKIE_SESION, { path: "/" });
    return { ok: true };
  }

  /**
   * Endpoint para el API Gateway (NGINX auth_request): valida la identidad y el
   * rol para la ruta original antes de enrutar al microservicio.
   */
  @Get("verificar")
  async verificar(@Headers("x-original-uri") rutaOriginal: string | undefined, @UsuarioActual() sesion: Sesion, @Res({ passthrough: true }) respuesta: Response) {
    const acceso = evaluarAcceso(rutaOriginal ?? "/", sesion);
    if (!acceso.permitido) throw new HttpException({ error: acceso.mensaje }, acceso.estado);
    respuesta.setHeader("X-Usuario-Id", String(sesion.id));
    respuesta.setHeader("X-Usuario-Rol", encodeURIComponent(sesion.rol));
    return { ok: true };
  }
}

@Controller("api/usuarios")
export class ControladorUsuarios {
  constructor(private readonly usuarios: ServicioUsuarios) {}

  @Get()
  listar(@Query() filtro: FiltroUsuariosDto) {
    return this.usuarios.listar(filtro);
  }

  @Post()
  crear(@Body() datos: NuevoPersonalDto, @UsuarioActual() autor: Sesion) {
    return this.usuarios.crearPersonal(datos, autor);
  }

  @Patch(":id")
  actualizar(@Param("id", ParseIntPipe) id: number, @Body() cambios: CambiosUsuarioDto, @UsuarioActual() autor: Sesion) {
    return this.usuarios.actualizar(id, cambios, autor);
  }

  @Post("sincronizacion")
  sincronizar(@UsuarioActual() autor: Sesion) {
    return this.usuarios.sincronizarConBaseEscolar(autor);
  }
}
