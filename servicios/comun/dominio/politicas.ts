/**
 * Políticas de préstamo de la Biblioteca (Propuesta SIGEB, sección 2.2).
 *
 * Los valores por rol viven en la tabla ROLES de la base de datos para poder
 * cambiarlos sin tocar código (SWEBOK 04 · "anticipar el cambio"). Este archivo
 * define los tipos y los valores que la propuesta fija, usados por las pruebas
 * y por los datos iniciales.
 */

export type RolUsuario = "Administrador" | "Bibliotecario" | "Alumno" | "Profesor" | "Colaborador";

/** Tipos de uso que el Administrador del catálogo asigna a cada libro. */
export const TIPOS_USO = ["Préstamo externo", "Consulta interna", "Reservado"] as const;
export type TipoUso = (typeof TIPOS_USO)[number];

/** Estados posibles de un ejemplar físico. "Dado de baja" solo lo pone la Baja de libros (HU2-SP1). */
export const ESTADOS_EJEMPLAR = ["Disponible", "Prestado", "Perdido", "Robado", "Dañado", "Dado de baja"] as const;
export type EstadoEjemplar = (typeof ESTADOS_EJEMPLAR)[number];

/** Motivos de la Baja de libros (HU2-SP1). */
export const MOTIVOS_BAJA_EJEMPLAR = ["Perdido", "Dañado", "Robado", "Obsoleto"] as const;
export type MotivoBajaEjemplar = (typeof MOTIVOS_BAJA_EJEMPLAR)[number];

export type PoliticaPrestamo = {
  /** Días hábiles de vigencia (Regla 5 alumnos, Regla 6 maestros). */
  diasHabiles: number;
  /** Ejemplares que puede tener prestados a la vez (Regla 1: no más de dos). */
  maxEjemplares: number;
  /** Renovaciones por préstamo (Regla 2: dos; Regla 6: tres para maestros). */
  maxRenovaciones: number;
};

/** Regla 3 y Regla 6: multa diaria por retraso, en pesos. */
export const MULTA_DIARIA_MXN = 10;

/**
 * "Exceso de multas" no tiene un número en la propuesta (función Alumnos
 * suspendidos). Se usa 3 multas pendientes como valor configurable hasta que el
 * Product Owner lo confirme. Ver docs/decisiones-pendientes.md.
 */
export const MULTAS_PARA_SUSPENSION = 3;

/** Valores que fija la propuesta para quienes solicitan préstamos. */
export const POLITICAS_PROPUESTA: Record<"Alumno" | "Profesor", PoliticaPrestamo> = {
  Alumno: { diasHabiles: 5, maxEjemplares: 2, maxRenovaciones: 2 },
  Profesor: { diasHabiles: 10, maxEjemplares: 2, maxRenovaciones: 3 },
};
