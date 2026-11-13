/**
 * Piezas de NestJS compartidas por todos los microservicios: guardia de
 * autenticación, decorador de usuario, errores de negocio con formato uniforme
 * y arranque del servicio.
 */
import "reflect-metadata";
import {
  ArgumentsHost,
  Catch,
  createParamDecorator,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  CanActivate,
  ValidationPipe,
  type ValidationError,
  type INestApplication,
  type Type,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { Request, Response } from "express";
import { evaluarAcceso, extraerToken, verificarToken, type Sesion } from "./auth";

type SolicitudConSesion = Request & { sesion?: Sesion };

/** Defensa en profundidad: además del gateway, cada servicio valida el JWT y el rol. */
@Injectable()
export class GuardiaSesion implements CanActivate {
  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const solicitud = contexto.switchToHttp().getRequest<SolicitudConSesion>();
    const token = extraerToken(solicitud.headers as { authorization?: string; cookie?: string }, solicitud.cookies);
    const sesion = token ? await verificarToken(token) : null;
    const acceso = evaluarAcceso(solicitud.originalUrl, sesion);
    if (!acceso.permitido) throw new HttpException({ error: acceso.mensaje }, acceso.estado);
    if (sesion) solicitud.sesion = sesion;
    return true;
  }
}

export const UsuarioActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext): Sesion => {
  const sesion = contexto.switchToHttp().getRequest<SolicitudConSesion>().sesion;
  if (!sesion) throw new HttpException({ error: "Debes iniciar sesión." }, HttpStatus.UNAUTHORIZED);
  return sesion;
});

/** Una regla de negocio impide la operación (409) y se explican todos los motivos. */
export class ErrorDeNegocio extends HttpException {
  constructor(mensaje: string, motivos: string[] = []) {
    super({ error: mensaje, motivos }, HttpStatus.CONFLICT);
  }
}

export class NoEncontrado extends HttpException {
  constructor(recurso: string) {
    super({ error: `${recurso} no existe.` }, HttpStatus.NOT_FOUND);
  }
}

/** Formato uniforme de error en todas las APIs: { error, motivos? }. */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  constructor(private readonly servicio: string) {}

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const respuesta = host.switchToHttp().getResponse<Response>();
    if (excepcion instanceof HttpException) {
      const cuerpo = excepcion.getResponse();
      if (typeof cuerpo === "object" && cuerpo && "error" in cuerpo) {
        respuesta.status(excepcion.getStatus()).json(cuerpo);
        return;
      }
      const mensaje = typeof cuerpo === "object" && cuerpo && "message" in cuerpo ? (cuerpo as { message: unknown }).message : excepcion.message;
      respuesta.status(excepcion.getStatus()).json({
        error: excepcion.getStatus() === 400 ? "Los datos enviados no son válidos." : String(mensaje),
        motivos: Array.isArray(mensaje) ? mensaje.map(String) : [],
      });
      return;
    }
    const codigo = (excepcion as { code?: string }).code;
    if (codigo === "23505") {
      respuesta.status(409).json({ error: "El registro ya existe (dato duplicado).", motivos: [String((excepcion as { detail?: string }).detail ?? "")] });
      return;
    }
    if (codigo === "23514" || codigo === "23503") {
      respuesta.status(400).json({ error: "Los datos no cumplen las reglas de la base de datos.", motivos: [String((excepcion as { detail?: string; message?: string }).detail ?? (excepcion as Error).message)] });
      return;
    }
    console.error(`[${this.servicio}] Error no controlado:`, excepcion);
    respuesta.status(500).json({ error: `Error interno en el servicio ${this.servicio}. El incidente quedó registrado.` });
  }
}

/**
 * Convierte los errores de class-validator en mensajes en español: usa el
 * mensaje propio del DTO cuando existe y uno genérico por campo cuando no.
 */
function erroresDeValidacion(errores: ValidationError[]): HttpException {
  const motivos = errores.flatMap((error) => {
    if (error.constraints?.whitelistValidation) return [`El campo "${error.property}" no se reconoce.`];
    const propios = Object.values(error.constraints ?? {}).filter((mensaje) => !/\b(must|should)\b/.test(mensaje));
    return propios.length ? propios : [`El campo "${error.property}" falta o tiene un formato inválido.`];
  });
  return new HttpException({ error: "Los datos enviados no son válidos.", motivos }, HttpStatus.BAD_REQUEST);
}

export async function iniciarServicio(modulo: Type<unknown>, nombre: string, puerto: number): Promise<INestApplication> {
  const app = await crearAplicacion(modulo, nombre);
  await app.listen(Number(process.env.PORT ?? puerto));
  console.log(`[${nombre}] escuchando en el puerto ${process.env.PORT ?? puerto}`);
  return app;
}

export async function crearAplicacion(modulo: Type<unknown>, nombre: string): Promise<INestApplication> {
  const app = await NestFactory.create(modulo, { logger: ["error", "warn"] });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: erroresDeValidacion }));
  app.useGlobalFilters(new FiltroErrores(nombre));
  app.useGlobalGuards(new GuardiaSesion());
  app.getHttpAdapter().get("/salud", (_req: Request, res: Response) => { res.json({ servicio: nombre, estado: "ok" }); });
  return app;
}
