import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateNested } from "class-validator";
import { ESTADOS_EJEMPLAR, TIPOS_USO, type EstadoEjemplar, type TipoUso } from "../../comun/dominio/politicas";

export class UbicacionDto {
  @IsString() @Length(1, 20) piso!: string;
  @IsString() @Length(1, 50) area!: string;
  @IsString() @Length(1, 10) pasillo!: string;
  @IsString() @Length(1, 10) estante!: string;
}

export class FichaDto {
  @IsString() isbn!: string;
  @IsString() @Length(1, 200) titulo!: string;
  @IsArray() @ArrayMinSize(1, { message: "Captura al menos un autor." }) @IsString({ each: true }) autores!: string[];
  @IsString() @Length(1, 100) editorial!: string;
  @IsString() @Length(1, 100) tema!: string;
  @IsOptional() @IsInt() @Min(1) edicion?: number;
  @IsOptional() @IsInt() @Min(1450) @Max(2100) anioPublicacion?: number;
  @IsOptional() @IsInt() @Min(1) paginas?: number;
  @IsIn(TIPOS_USO, { message: `El tipo de uso debe ser: ${TIPOS_USO.join(", ")}.` }) tipoUso!: TipoUso;
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "El precio de la última compra en dólares es obligatorio (Regla 4)." }) @Min(0) precioUsd!: number;
}

export class NuevaFichaDto extends FichaDto {
  @IsInt() @Min(1, { message: "Registra al menos un ejemplar." }) @Max(200) ejemplares!: number;
  @ValidateNested() @Type(() => UbicacionDto) ubicacion!: UbicacionDto;
}

export class CambiosFichaDto {
  @IsOptional() @IsString() isbn?: string;
  @IsOptional() @IsString() @Length(1, 200) titulo?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsString({ each: true }) autores?: string[];
  @IsOptional() @IsString() @Length(1, 100) editorial?: string;
  @IsOptional() @IsString() @Length(1, 100) tema?: string;
  @IsOptional() @IsInt() @Min(1) edicion?: number;
  @IsOptional() @IsInt() @Min(1450) @Max(2100) anioPublicacion?: number;
  @IsOptional() @IsInt() @Min(1) paginas?: number;
  @IsOptional() @IsIn(TIPOS_USO) tipoUso?: TipoUso;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) precioUsd?: number;
}

export class NuevosEjemplaresDto {
  @IsInt() @Min(1) @Max(200) cantidad!: number;
  @ValidateNested() @Type(() => UbicacionDto) ubicacion!: UbicacionDto;
}

export class CambioEjemplarDto {
  @IsOptional() @IsIn(ESTADOS_EJEMPLAR) estado?: EstadoEjemplar;
  @IsOptional() @ValidateNested() @Type(() => UbicacionDto) ubicacion?: UbicacionDto;
}

/** Listado de libros por diversos filtros (Product Backlog, Gestionar libros). */
export class FiltroLibrosDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() tema?: string;
  @IsOptional() @IsString() editorial?: string;
  @IsOptional() @IsIn(TIPOS_USO) tipoUso?: TipoUso;
  @IsOptional() @IsIn(ESTADOS_EJEMPLAR) estado?: EstadoEjemplar;
  @IsOptional() @IsString() piso?: string;
}

export class SolicitudCompraDto {
  @IsString() @Length(1, 200) titulo!: string;
  @IsString() @Length(1, 100) autor!: string;
  @IsOptional() @IsString() isbn?: string;
  @IsInt() @Min(1) @Max(100) cantidad!: number;
  @IsString() @Length(5, 300) justificacion!: string;
}

export class DecisionSolicitudDto {
  @IsIn(["Aprobada", "Rechazada"]) estatus!: "Aprobada" | "Rechazada";
}
