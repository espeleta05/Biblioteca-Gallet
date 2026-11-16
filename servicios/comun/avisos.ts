/**
 * Recibos y avisos al usuario (correo, WhatsApp o impresión). Cada envío queda en
 * la tabla AVISOS con su resultado real (Enviado, Simulado o Fallido).
 */
import { consultarUno, type Ejecutor, obtenerPool } from "./db";
import { enviarNotificacion, type Canal, type ResultadoEnvio } from "./integraciones";

export type TipoAviso = "Recibo de préstamo" | "Recibo de pago" | "Aviso de adeudo" | "Lista de espera";

export type Contacto = { nombre: string; correo: string; telefono: string | null; identificador: string };

export async function contactoDe(idCredencial: number, ejecutor: Ejecutor = obtenerPool()): Promise<Contacto> {
  const contacto = await consultarUno<Contacto>(`
    SELECT COALESCE(e.nombre_completo, p.nombre_completo) AS nombre,
           COALESCE(e.correo_institucional, p.correo_institucional) AS correo,
           COALESCE(e.telefono, p.telefono) AS telefono,
           c.matricula_nomina AS identificador
    FROM CREDENCIALES c
    LEFT JOIN USUARIOS_ESCOLARES e ON e.id_credencial = c.id_credencial
    LEFT JOIN PERSONAL_BIBLIOTECA p ON p.id_credencial = c.id_credencial
    WHERE c.id_credencial = $1`, [idCredencial], ejecutor);
  if (!contacto) throw new Error(`No existe el usuario con credencial ${idCredencial}.`);
  return contacto;
}

export function destinoPara(canal: Canal, contacto: Contacto): string {
  if (canal === "Correo") return contacto.correo;
  if (canal === "WhatsApp") {
    if (!contacto.telefono) throw new Error(`${contacto.nombre} no tiene teléfono registrado para WhatsApp.`);
    return contacto.telefono;
  }
  return "Mostrador de la biblioteca";
}

/** Envía el aviso y registra el resultado. Se llama después de confirmar la transacción. */
export async function enviarYRegistrar(params: { idCredencial: number; tipo: TipoAviso; canal: Canal; asunto: string; mensaje: string }): Promise<ResultadoEnvio & { destino: string }> {
  const contacto = await contactoDe(params.idCredencial);
  const destino = destinoPara(params.canal, contacto);
  const resultado = await enviarNotificacion(params.canal, destino, params.asunto, params.mensaje);
  await obtenerPool().query(
    "INSERT INTO AVISOS (id_credencial, tipo, canal, destino, mensaje, estado, detalle_envio) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [params.idCredencial, params.tipo, params.canal, destino, params.mensaje, resultado.estado, resultado.detalle],
  );
  return { ...resultado, destino };
}

export function formatoPesos(monto: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(monto);
}
