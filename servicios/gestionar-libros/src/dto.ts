import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateNested } from "class-validator";
import { ESTADOS_EJEMPLAR, MOTIVOS_BAJA_EJEMPLAR, TIPOS_USO, type EstadoEjemplar, type MotivoBajaEjemplar, type TipoUso } from "../../comun/dominio/politicas";

export class UbicacionDto {
  @IsString() @Length(1, 20, { message: "Captura el piso." }) piso!: string;
  @IsString() @Length(1, 50, { message: "Captura el área." }) area!: string;
  @IsString() @Length(1, 10, { message: "Captura el pasillo." }) pasillo!: string;
  @IsString() @Length(1, 10, { message: "Captura el estante." }) estante!: string;
}

export class FichaDto {
  @IsString() @Length(1, 20, { message: "Captura el ISBN." }) isbn!: string;
  @IsString() @Length(1, 200, { message: "Captura el título." }) titulo!: string;
  @IsArray() @ArrayMinSize(1, { message: "Captura al menos un autor." }) @IsString({ each: true }) autores!: string[];
  @IsString() @Length(1, 100, { message: "Captura la editorial." }) editorial!: string;
  @IsString() @Length(1, 100, { message: "Captura el tema." }) tema!: string;
  @IsOptional() @IsInt() @Min(1) edicion?: number;
  @IsOptional() @IsInt() @Min(1450) @Max(2100) anioPublicacion?: number;
  @IsOptional() @IsInt() @Min(1) paginas?: number;
  @IsIn(TIPOS_USO, { message: `El tipo de uso debe ser: ${TIPOS_USO.join(", ")}.` }) tipoUso!: TipoUso;
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "El precio de la última compra en dólares es obligatorio (Regla 4)." }) @Min(0) precioUsd!: number;
}

/** Alta de libros (HU1-SP1). */
export class NuevaFichaDto extends FichaDto {
  static mensajeInvalido = "Captura todos los campos obligatorios.";
  @IsInt() @Min(1, { message: "Registra al menos un ejemplar." }) @Max(200) ejemplares!: number;
  @ValidateNested() @Type(() => UbicacionDto) ubicacion!: UbicacionDto;
}

/** Cambio de libros (HU3-SP1). */
export class CambiosFichaDto {
  @IsOptional() @IsString() @Length(1, 20, { message: "Captura el ISBN." }) isbn?: string;
  @IsOptional() @IsString() @Length(1, 200, { message: "El título no puede quedar vacío." }) titulo?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1, { message: "Captura al menos un autor." }) @IsString({ each: true }) autores?: string[];
  @IsOptional() @IsString() @Length(1, 100, { message: "La editorial no puede quedar vacía." }) editorial?: string;
  @IsOptional() @IsString() @Length(1, 100, { message: "El tema no puede quedar vacío." }) tema?: string;
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

export class CambioUbicacionDto {
  @ValidateNested() @Type(() => UbicacionDto) ubicacion!: UbicacionDto;
}

export class CambioEjemplarDto {
  @IsOptional() @IsIn(ESTADOS_EJEMPLAR) estado?: EstadoEjemplar;
  @IsOptional() @ValidateNested() @Type(() => UbicacionDto) ubicacion?: UbicacionDto;
}

/** Baja de libros (HU2-SP1): la clave del ejemplar y el motivo. */
export class BajaEjemplarDto {
  @IsString() clave!: string;
  @IsOptional() @IsIn([...MOTIVOS_BAJA_EJEMPLAR, ""], { message: "Selecciona el motivo de la baja." }) motivo?: MotivoBajaEjemplar | "";
}

export class FiltroLibrosDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() tema?: string;
  @IsOptional() @IsString() editorial?: string;
  @IsOptional() @IsIn(TIPOS_USO) tipoUso?: TipoUso;
  @IsOptional() @IsIn(ESTADOS_EJEMPLAR) estado?: EstadoEjemplar;
  @IsOptional() @IsString() piso?: string;
}

/** Listado de libros por filtro para inventario (HU6-SP1): un renglón por ejemplar. */
export class FiltroInventarioDto {
  @IsOptional() @IsString() tema?: string;
  @IsOptional() @IsString() autor?: string;
  @IsOptional() @IsString() editorial?: string;
  @IsOptional() @IsIn(ESTADOS_EJEMPLAR) estado?: EstadoEjemplar;
  @IsOptional() @IsString() piso?: string;
  @IsOptional() @IsString() area?: string;
  @IsOptional() @IsString() pasillo?: string;
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

// ── Compra de libros (HU5-SP1) ───────────────────────────────────────────────

export class LibroCompraDto {
  @IsOptional() @IsInt() idSolicitud?: number;
  @IsString() @Length(1, 200, { message: "Captura el título de cada libro." }) titulo!: string;
  @IsString() @Length(10, 17, { message: "Captura el ISBN de cada libro." }) isbn!: string;
  @IsInt({ message: "La cantidad debe ser un número entero." }) @Min(1, { message: "La cantidad debe ser mayor que cero." }) @Max(500) cantidad!: number;
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "El precio debe ser un número." }) @Min(0.01, { message: "El precio debe ser mayor que cero." }) precioMxn!: number;
}

export class OrdenCompraDto {
  static mensajeInvalido = "Revisa la editorial, las cantidades y los precios.";
  @IsString() @Length(1, 100, { message: "Captura la editorial." }) editorial!: string;
  @IsArray() @ArrayMinSize(1, { message: "Elige al menos un libro." }) @ValidateNested({ each: true }) @Type(() => LibroCompraDto) libros!: LibroCompraDto[];
}

export class RecibidoDto {
  @IsInt() idDetalle!: number;
  @IsInt() @Min(0) cantidad!: number;
}

export class RecepcionDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => RecibidoDto) recibidos!: RecibidoDto[];
}

export class PresupuestoDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "El presupuesto debe ser un número." }) @Min(0) montoMxn!: number;
}

export class NuevaUbicacionDto extends UbicacionDto {}
