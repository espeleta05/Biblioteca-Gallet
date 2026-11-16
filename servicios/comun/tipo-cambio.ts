/**
 * Tipo de cambio para la Regla 4: se consulta automáticamente en Banxico una vez
 * al día y se guarda en TIPO_CAMBIO. Si Banxico no responde, se usa el último
 * valor guardado y se informa su fecha, para que el cobro sea transparente.
 */
import { consultarUno, type Ejecutor, obtenerPool } from "./db";
import { hoyEnBiblioteca } from "./dominio/fechas";
import { consultarTipoCambioBanxico } from "./integraciones";

export type TipoCambio = { fecha: string; valor: number; fuente: string; actualizadoHoy: boolean; aviso?: string };

export async function tipoCambioVigente(ejecutor: Ejecutor = obtenerPool()): Promise<TipoCambio> {
  const hoy = hoyEnBiblioteca();
  let aviso: string | undefined;
  const deHoy = await consultarUno<{ fecha: string; valor_mxn: number; fuente: string }>("SELECT fecha, valor_mxn, fuente FROM TIPO_CAMBIO WHERE fecha = $1", [hoy], ejecutor);
  if (deHoy) return { fecha: deHoy.fecha, valor: deHoy.valor_mxn, fuente: deHoy.fuente, actualizadoHoy: true };
  try {
    const banxico = await consultarTipoCambioBanxico();
    if (banxico) {
      await obtenerPool().query("INSERT INTO TIPO_CAMBIO (fecha, valor_mxn, fuente) VALUES ($1, $2, 'Banxico SIE SF43718') ON CONFLICT (fecha) DO UPDATE SET valor_mxn = EXCLUDED.valor_mxn, fuente = EXCLUDED.fuente", [banxico.fecha, banxico.valor]);
      return { fecha: banxico.fecha, valor: banxico.valor, fuente: "Banxico SIE SF43718", actualizadoHoy: true };
    }
    aviso = "BANXICO_TOKEN no está configurado; se usa el último tipo de cambio guardado.";
  } catch (error) {
    aviso = `Banxico no respondió (${(error as Error).message.slice(0, 120)}); se usa el último tipo de cambio guardado.`;
  }
  const ultimo = await consultarUno<{ fecha: string; valor_mxn: number; fuente: string }>("SELECT fecha, valor_mxn, fuente FROM TIPO_CAMBIO ORDER BY fecha DESC LIMIT 1", [], ejecutor);
  if (!ultimo) throw new Error("No hay tipo de cambio disponible: configura BANXICO_TOKEN o registra uno en TIPO_CAMBIO.");
  return { fecha: ultimo.fecha, valor: ultimo.valor_mxn, fuente: ultimo.fuente, actualizadoHoy: false, aviso };
}
