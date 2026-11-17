import { Type } from "class-transformer";
import { IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, MinLength } from "class-validator";
import { LISTA_PERMISOS } from "../../comun/auth";

const TIPOS_CUENTA = ["Administrador", "Bibliotecario", "Alumno", "Profesor", "Colaborador"] as const;
export type TipoCuenta = (typeof TIPOS_CUENTA)[number];
const CLAVE = /^[A-Za-z0-9-]{3,20}$/;
const MENSAJE_CLAVE = "La matrícula o nómina solo admite letras, números y guiones (3 a 20).";

export class InicioSesionDto {
  @IsString() @Length(1, 20) identificador!: string;
  @IsString() @Length(1, 100) contrasena!: string;
}

/** Alta de cuentas (HU2-SP0): cualquier tipo de cuenta, con contraseña temporal. */
export class NuevaCuentaDto {
  @IsString() @Length(3, 150, { message: "Captura el nombre completo." }) nombre!: string;
  @IsString() @Matches(CLAVE, { message: MENSAJE_CLAVE }) identificador!: string;
  @IsEmail({}, { message: "El correo no es válido (debe tener @ y dominio)." }) correo!: string;
  @IsOptional() @Matches(/^\d{10}$/, { message: "El teléfono debe tener 10 dígitos." }) telefono?: string;
  @IsIn(TIPOS_CUENTA, { message: "Elige el tipo de cuenta." }) rol!: TipoCuenta;
  @IsString() @MinLength(8, { message: "La contraseña temporal debe tener al menos 8 caracteres." }) contrasena!: string;
}

/** Cambio de cuentas (HU4-SP0). La baja tiene su propia operación. */
export class CambiosCuentaDto {
  @IsOptional() @IsString() @Length(3, 150, { message: "El nombre debe tener entre 3 y 150 caracteres." }) nombre?: string;
  @IsOptional() @IsString() @Matches(CLAVE, { message: MENSAJE_CLAVE }) identificador?: string;
  @IsOptional() @IsEmail({}, { message: "El correo no es válido (debe tener @ y dominio)." }) correo?: string;
  @IsOptional() @Matches(/^\d{10}$/, { message: "El teléfono debe tener 10 dígitos." }) telefono?: string;
  @IsOptional() @IsIn(["Administrador", "Bibliotecario"]) rol?: "Administrador" | "Bibliotecario";
  @IsOptional() @IsIn(["Activa"], { message: "Para dar de baja una cuenta usa la opción Baja de cuentas." }) estatus?: "Activa";
  @IsOptional() @IsString() @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres." }) contrasena?: string;
}

/** Baja de cuentas (HU3-SP0). */
export class BajaCuentaDto {
  @IsString() @Length(1, 20, { message: "Captura la clave de la cuenta." }) identificador!: string;
  @IsString() @Length(5, 255, { message: "Escribe el motivo de la baja (mínimo 5 caracteres)." }) motivo!: string;
}

/** Consulta de cuentas (HU5-SP0). */
export class FiltroUsuariosDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(TIPOS_CUENTA) rol?: string;
  @IsOptional() @IsIn(["Activa", "Inactiva"]) estatus?: string;
}

/** Gestión de perfiles (HU6-SP0). */
export class NuevoPerfilDto {
  @IsString() @Length(3, 50, { message: "El nombre del perfil debe tener entre 3 y 50 caracteres." }) nombre!: string;
  @IsArray() @IsIn(LISTA_PERMISOS, { each: true, message: "Uno de los permisos no existe." }) permisos!: string[];
}

export class AsignarPerfilDto {
  @IsString() @Length(1, 20, { message: "Captura la clave de la cuenta." }) identificador!: string;
  @Type(() => Number) @IsInt({ message: "Elige el perfil." }) idPerfil!: number;
}
