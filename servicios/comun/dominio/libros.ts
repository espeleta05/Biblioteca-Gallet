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
  return null;
}
