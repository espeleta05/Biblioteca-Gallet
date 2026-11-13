import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MinLength } from "class-validator";

export class InicioSesionDto {
  @IsString() @Length(1, 20) identificador!: string;
  @IsString() @Length(1, 100) contrasena!: string;
}

export class NuevoPersonalDto {
  @IsString() @Length(3, 150) nombre!: string;
  @IsString() @Matches(/^[A-Za-z0-9-]{3,20}$/, { message: "La nómina solo admite letras, números y guiones (3 a 20)." }) identificador!: string;
  @IsEmail({}, { message: "El correo institucional no es válido." }) correo!: string;
  @IsOptional() @Matches(/^\d{10}$/, { message: "El teléfono debe tener 10 dígitos." }) telefono?: string;
  @IsIn(["Administrador", "Bibliotecario"], { message: "Desde SIGEB solo se da de alta personal de la biblioteca." }) rol!: "Administrador" | "Bibliotecario";
  @IsString() @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres." }) contrasena!: string;
}

export class CambiosUsuarioDto {
  @IsOptional() @IsString() @Length(3, 150) nombre?: string;
  @IsOptional() @IsEmail() correo?: string;
  @IsOptional() @Matches(/^\d{10}$/) telefono?: string;
  @IsOptional() @IsIn(["Administrador", "Bibliotecario"]) rol?: "Administrador" | "Bibliotecario";
  @IsOptional() @IsIn(["Activa", "Inactiva"]) estatus?: "Activa" | "Inactiva";
  @IsOptional() @IsString() @MinLength(8) contrasena?: string;
}

export class FiltroUsuariosDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(["Administrador", "Bibliotecario", "Alumno", "Profesor", "Colaborador"]) rol?: string;
}
