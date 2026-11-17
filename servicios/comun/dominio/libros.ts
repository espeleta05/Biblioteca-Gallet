/**
 * Reglas de "Gestionar libros": validación de la ficha bibliográfica y de los
 * cambios de estado de un ejemplar.
 */
import type { EstadoEjemplar } from "./politicas";

/** ISBN-10 o ISBN-13 con dígito verificador correcto (se aceptan guiones). */
export function normalizarIsbn(entrada: string): string | null {
  const isbn = entrada.replace(/[-\s]/g, "").toUpperCase();
  if (/^\d{13}$/.test(isbn)) {
    const suma = isbn.slice(0, 12).split("").reduce((total, digito, i) => total + Number(digito) * (i % 2 === 0 ? 1 : 3), 0);
    return (10 - (suma % 10)) % 10 === Number(isbn[12]) ? isbn : null;
  }
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const suma = isbn.split("").reduce((total, caracter, i) => total + (caracter === "X" ? 10 : Number(caracter)) * (10 - i), 0);
    return suma % 11 === 0 ? isbn : null;
  }
  return null;
}

/**
 * Cambios de estado que el personal puede registrar a mano en un ejemplar.
 * "Prestado" solo lo asigna el préstamo y solo la devolución lo libera, para que
 * el estado siempre coincida con los registros de circulación.
 */
export function validarCambioEstado(actual: EstadoEjemplar, nuevo: EstadoEjemplar): string | null {
  if (actual === nuevo) return null;
  if (actual === "Prestado") return "El ejemplar está prestado: su estado cambia al registrar la devolución.";
  if (nuevo === "Prestado") return "Un ejemplar queda como prestado solo al registrar un préstamo.";
  if (actual === "Dado de baja") return "El ejemplar está dado de baja y ya no cambia de estado.";
  if (nuevo === "Dado de baja") return "Para dar de baja un ejemplar usa la opción Baja de libros (pide el motivo).";
  return null;
}

/** Clave del libro que ve el personal: LIB-0001 (HU1-SP1). */
export function claveLibro(id: number): string {
  return `LIB-${String(id).padStart(4, "0")}`;
}

/** Acepta "LIB-0007", "lib7" o "7"; devuelve el id o null si no es una clave de libro. */
export function idDeClaveLibro(dato: string): number | null {
  // Hasta 6 dígitos: un ISBN tiene 10 o 13, así que no se confunden.
  const m = dato.trim().match(/^(?:LIB-?)?(\d{1,6})$/i);
  return m ? Number(m[1]) : null;
}

/**
 * Baja de libros (HU2-SP1): un ejemplar prestado o apartado para la lista de
 * espera ("Reservado") no se da de baja, y siempre se pide el motivo.
 */
export function validarBajaEjemplar(estado: EstadoEjemplar, reservado: boolean, motivo: string | undefined): string | null {
  if (!motivo) return "Selecciona el motivo de la baja.";
  if (estado === "Prestado" || reservado) return "No se puede dar de baja un ejemplar prestado o reservado.";
  if (estado === "Dado de baja") return "El ejemplar ya está dado de baja.";
  return null;
}

/** Compra de libros (HU5-SP1): cuánto se pasa la orden del presupuesto disponible (0 si cabe). */
export function excesoPresupuesto(disponibleMxn: number, totalMxn: number): number {
  return Math.max(0, Math.round((totalMxn - disponibleMxn) * 100) / 100);
}

/** Recepción de una orden: libros que faltan y estatus resultante. */
export function estadoRecepcion(detalles: Array<{ cantidad: number; recibida: number }>): { faltan: number; estatus: "Recibida" | "Recibida parcialmente" } {
  const faltan = detalles.reduce((s, d) => s + Math.max(0, d.cantidad - d.recibida), 0);
  return { faltan, estatus: faltan === 0 ? "Recibida" : "Recibida parcialmente" };
}

/** Precio en dólares para la Regla 4 a partir del precio de compra en pesos. */
export function precioUsdDeCompra(precioMxn: number, tipoCambio: number): number {
  return Math.round((precioMxn / tipoCambio) * 100) / 100;
}
