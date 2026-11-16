/**
 * Reglas de "Devolver libros", "Gestión de multas" y "Alumnos suspendidos"
 * (Propuesta SIGEB, Reglas 3 y 4).
 */

import { diasDeRetraso } from "./fechas";
import { MULTA_DIARIA_MXN, MULTAS_PARA_SUSPENSION } from "./politicas";

export type MotivoMulta = "Retraso" | "Daño" | "Pérdida" | "Robo";

/** Redondea a centavos para evitar errores de punto flotante en montos. */
export function redondearPesos(monto: number): number {
  return Math.round((monto + Number.EPSILON) * 100) / 100;
}

/** Regla 3: $10 por cada día de retraso. */
export function multaPorRetraso(vencimiento: string, entrega: string, multaDiaria = MULTA_DIARIA_MXN): number {
  return diasDeRetraso(vencimiento, entrega) * multaDiaria;
}

/**
 * Regla 4: valor presente del libro = precio de la última compra en dólares ×
 * tipo de cambio actual (Banxico).
 */
export function costoReposicion(precioUltimaCompraUsd: number, tipoCambioMxnPorUsd: number): number {
  if (!Number.isFinite(precioUltimaCompraUsd) || precioUltimaCompraUsd < 0) {
    throw new Error(`Precio de compra inválido (${precioUltimaCompraUsd} USD): registra el precio en la ficha bibliográfica.`);
  }
  if (!Number.isFinite(tipoCambioMxnPorUsd) || tipoCambioMxnPorUsd <= 0) {
    throw new Error(`Tipo de cambio inválido (${tipoCambioMxnPorUsd} MXN/USD).`);
  }
  return redondearPesos(precioUltimaCompraUsd * tipoCambioMxnPorUsd);
}

export type CargoDevolucion = { motivo: MotivoMulta; montoMxn: number };

/**
 * Multas que genera una devolución. Un libro dañado, perdido o robado genera el
 * costo de reposición; además, si se entregó tarde, se cobra el retraso.
 * Pérdida y robo no tienen fecha de entrega física, pero el retraso se cuenta
 * hasta el día en que se reporta.
 */
export function cargosPorDevolucion(params: {
  vencimiento: string;
  fechaReporte: string;
  condicion: "Buen estado" | "Dañado" | "Perdido" | "Robado";
  precioUltimaCompraUsd: number | null;
  tipoCambioMxnPorUsd: number;
}): CargoDevolucion[] {
  const cargos: CargoDevolucion[] = [];
  const retraso = multaPorRetraso(params.vencimiento, params.fechaReporte);
  if (retraso > 0) cargos.push({ motivo: "Retraso", montoMxn: retraso });
  if (params.condicion !== "Buen estado") {
    if (params.precioUltimaCompraUsd === null) {
      throw new Error("El libro no tiene precio de compra en dólares; no se puede calcular el costo de reposición (Regla 4).");
    }
    const motivo: MotivoMulta = params.condicion === "Dañado" ? "Daño" : params.condicion === "Perdido" ? "Pérdida" : "Robo";
    cargos.push({ motivo, montoMxn: costoReposicion(params.precioUltimaCompraUsd, params.tipoCambioMxnPorUsd) });
  }
  return cargos;
}

/** Alumnos suspendidos: exceso de multas pendientes. */
export function excedeMultas(multasPendientes: number, umbral = MULTAS_PARA_SUSPENSION): boolean {
  return multasPendientes >= umbral;
}

/**
 * Causas de suspensión que el sistema detecta solo: robo y exceso de multas.
 * El "mal uso" requiere el criterio del personal y se registra manualmente.
 */
export function motivoSuspensionAutomatica(params: { multasPendientes: number; motivoNuevaMulta?: MotivoMulta }): string | null {
  if (params.motivoNuevaMulta === "Robo") return "Robo de libro";
  if (excedeMultas(params.multasPendientes)) return `Exceso de multas (${params.multasPendientes} pendientes)`;
  return null;
}
