/**
 * Reglas de "Prestar libros" (Propuesta SIGEB, Reglas 1, 2, 5 y 6).
 *
 * Las funciones son puras: reciben los datos ya consultados y devuelven una
 * decisión con todos los motivos de rechazo, para que el bibliotecario vea de una
 * sola vez por qué no procede la operación (Google cap. 10: mensajes de error
 * descriptivos).
 */

import { estaVencido, sumarDiasHabiles } from "./fechas";
import type { EstadoEjemplar, PoliticaPrestamo, TipoUso } from "./politicas";

export type Decision = { permitido: true } | { permitido: false; motivos: string[] };

export type Solicitante = {
  activo: boolean;
  suspendido: boolean;
  multasPendientes: number;
  prestamosActivos: number;
  /** Fechas de vencimiento de los préstamos activos, "AAAA-MM-DD". */
  vencimientosActivos: string[];
  politica: PoliticaPrestamo;
};

export type LibroSolicitado = {
  tipoUso: TipoUso;
  ejemplaresDisponibles: number;
};

function decidir(motivos: string[]): Decision {
  return motivos.length === 0 ? { permitido: true } : { permitido: false, motivos };
}

/** Validación de condición del solicitante y del libro (Regla 1). */
export function evaluarPrestamo(solicitante: Solicitante, libro: LibroSolicitado, hoy: string): Decision {
  const motivos: string[] = [];

  if (!solicitante.activo) motivos.push("La cuenta del solicitante no está activa.");
  if (solicitante.suspendido) motivos.push("El solicitante está suspendido y no puede recibir préstamos.");
  if (solicitante.multasPendientes > 0) {
    motivos.push(`El solicitante debe ${solicitante.multasPendientes} multa(s); debe pagarlas antes de un nuevo préstamo.`);
  }
  if (solicitante.prestamosActivos >= solicitante.politica.maxEjemplares) {
    motivos.push(
      `El solicitante ya tiene ${solicitante.prestamosActivos} ejemplar(es) prestado(s); el máximo es ${solicitante.politica.maxEjemplares}.`,
    );
  }
  const vencidos = solicitante.vencimientosActivos.filter((fecha) => estaVencido(fecha, hoy)).length;
  if (vencidos > 0) motivos.push(`El solicitante tiene ${vencidos} préstamo(s) vencido(s) sin devolver.`);

  if (libro.tipoUso !== "Préstamo externo") {
    motivos.push(`El libro está catalogado como "${libro.tipoUso}" y no se presta fuera de la biblioteca.`);
  }
  if (libro.ejemplaresDisponibles <= 0) motivos.push("No hay ejemplares disponibles de este libro.");

  return decidir(motivos);
}

/** Fecha de vencimiento de un préstamo nuevo (Reglas 5 y 6). */
export function calcularVencimiento(fechaPrestamo: string, politica: PoliticaPrestamo): string {
  return sumarDiasHabiles(fechaPrestamo, politica.diasHabiles);
}

export type PrestamoParaRenovar = {
  estado: "Activo" | "Devuelto";
  vencimiento: string;
  renovacionesRealizadas: number;
};

/**
 * Renovación de préstamo (Reglas 2 y 6). Solo se renueva un préstamo activo que
 * no está vencido y que no ha llegado al máximo de renovaciones de su rol.
 */
export function evaluarRenovacion(prestamo: PrestamoParaRenovar, politica: PoliticaPrestamo, hoy: string): Decision {
  const motivos: string[] = [];
  if (prestamo.estado !== "Activo") motivos.push("Solo se puede renovar un préstamo activo.");
  if (estaVencido(prestamo.vencimiento, hoy)) {
    motivos.push(`El préstamo venció el ${prestamo.vencimiento}; un préstamo vencido no se renueva.`);
  }
  if (prestamo.renovacionesRealizadas >= politica.maxRenovaciones) {
    motivos.push(
      `El préstamo ya tiene ${prestamo.renovacionesRealizadas} renovación(es); el máximo para este usuario es ${politica.maxRenovaciones}.`,
    );
  }
  return decidir(motivos);
}

/** Nueva fecha de vencimiento tras renovar: se extiende desde el vencimiento actual. */
export function calcularVencimientoRenovado(vencimientoActual: string, politica: PoliticaPrestamo): string {
  return sumarDiasHabiles(vencimientoActual, politica.diasHabiles);
}

/** Estado en que queda el ejemplar según cómo se devuelve. */
export function estadoTrasDevolucion(condicion: "Buen estado" | "Dañado" | "Perdido" | "Robado"): EstadoEjemplar {
  return condicion === "Buen estado" ? "Disponible" : condicion;
}
