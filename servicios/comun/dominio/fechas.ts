/**
 * Utilidades de fecha para las reglas de préstamo.
 *
 * Se trabaja con fechas de calendario "AAAA-MM-DD" (sin hora) para que el
 * resultado no dependa de la zona horaria del servidor: un préstamo hecho a las
 * 19:00 en Monterrey no debe vencer un día después por convertir a UTC.
 */

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MS_POR_DIA = 86_400_000;

function aUtc(fecha: string): Date {
  if (!FORMATO_FECHA.test(fecha)) {
    throw new Error(`Fecha inválida "${fecha}": se esperaba el formato AAAA-MM-DD.`);
  }
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const resultado = new Date(Date.UTC(anio, mes - 1, dia));
  if (resultado.getUTCMonth() !== mes - 1 || resultado.getUTCDate() !== dia) {
    throw new Error(`Fecha inválida "${fecha}": el día no existe en el calendario.`);
  }
  return resultado;
}

function aTexto(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Fecha de hoy en la zona horaria de la biblioteca (America/Monterrey). */
export function hoyEnBiblioteca(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(ahora);
}

/** Normaliza un valor de la base de datos (Date o texto) a "AAAA-MM-DD". */
export function normalizarFecha(valor: string | Date): string {
  if (valor instanceof Date) return aTexto(new Date(Date.UTC(valor.getFullYear(), valor.getMonth(), valor.getDate())));
  return valor.slice(0, 10);
}

export function esDiaHabil(fecha: string): boolean {
  const dia = aUtc(fecha).getUTCDay();
  return dia !== 0 && dia !== 6;
}

/**
 * Suma días hábiles (lunes a viernes) a una fecha. Reglas 5 y 6: la vigencia se
 * cuenta "sin contar sábados ni domingos".
 */
export function sumarDiasHabiles(desde: string, dias: number): string {
  if (!Number.isInteger(dias) || dias < 0) {
    throw new Error(`Días hábiles inválidos (${dias}): debe ser un entero mayor o igual a cero.`);
  }
  const fecha = aUtc(desde);
  let restantes = dias;
  while (restantes > 0) {
    fecha.setUTCDate(fecha.getUTCDate() + 1);
    const dia = fecha.getUTCDay();
    if (dia !== 0 && dia !== 6) restantes -= 1;
  }
  return aTexto(fecha);
}

/**
 * Días naturales de retraso entre la fecha de vencimiento y la de entrega.
 * Regla 3 cobra "por cada día de retraso"; la propuesta no limita el conteo a
 * días hábiles, así que se cuentan días naturales. Ver docs/decisiones-pendientes.md.
 */
export function diasDeRetraso(vencimiento: string, entrega: string): number {
  const diferencia = Math.round((aUtc(entrega).getTime() - aUtc(vencimiento).getTime()) / MS_POR_DIA);
  return Math.max(0, diferencia);
}

export function estaVencido(vencimiento: string, hoy: string): boolean {
  return diasDeRetraso(vencimiento, hoy) > 0;
}
