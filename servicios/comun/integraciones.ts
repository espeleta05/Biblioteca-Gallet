/**
 * Integraciones con sistemas externos (Propuesta 3.5). Cada adaptador usa el
 * servicio real cuando hay credenciales en el entorno; si no, opera en modo
 * simulado y lo deja registrado ("Simulado"), sin ocultarlo.
 */
import nodemailer from "nodemailer";
import { config, PUERTOS, type NombreServicio } from "./config";
import { firmarToken } from "./auth";

const TIEMPO_LIMITE_MS = 2500; // RNF: respuesta total ≤ 3 s.

async function pedir<T>(url: string, opciones: RequestInit = {}, tiempoLimiteMs = TIEMPO_LIMITE_MS): Promise<T> {
  const respuesta = await fetch(url, { ...opciones, signal: AbortSignal.timeout(tiempoLimiteMs) });
  const texto = await respuesta.text();
  if (!respuesta.ok) throw new Error(`${opciones.method ?? "GET"} ${url} respondió ${respuesta.status}: ${texto.slice(0, 200)}`);
  return (texto ? JSON.parse(texto) : {}) as T;
}

// --- Banxico (API SIE): tipo de cambio para la Regla 4 ---------------------

/** Serie SF43718: tipo de cambio FIX pesos por dólar. */
const SERIE_FIX = "SF43718";

export async function consultarTipoCambioBanxico(): Promise<{ fecha: string; valor: number } | null> {
  const token = config.banxicoToken();
  if (!token) return null;
  type RespuestaSie = { bmx: { series: Array<{ datos?: Array<{ fecha: string; dato: string }> }> } };
  const datos = await pedir<RespuestaSie>(`https://www.banxico.org.mx/SieAPIRest/service/v1/series/${SERIE_FIX}/datos/oportuno`, {
    headers: { "Bmx-Token": token, Accept: "application/json" },
  });
  const ultimo = datos.bmx.series[0]?.datos?.[0];
  if (!ultimo) throw new Error("Banxico no devolvió datos para la serie FIX.");
  const [dia, mes, anio] = ultimo.fecha.split("/");
  const valor = Number(ultimo.dato.replace(",", ""));
  if (!Number.isFinite(valor) || valor <= 0) throw new Error(`Banxico devolvió un tipo de cambio inválido: ${ultimo.dato}`);
  return { fecha: `${anio}-${mes}-${dia}`, valor };
}

// --- Notificaciones: correo, WhatsApp Business e impresión -----------------

export type Canal = "Correo" | "WhatsApp" | "Impresión";
export type ResultadoEnvio = { estado: "Enviado" | "Simulado" | "Fallido"; detalle: string };

export async function enviarNotificacion(canal: Canal, destino: string, asunto: string, mensaje: string): Promise<ResultadoEnvio> {
  try {
    if (canal === "Impresión") return { estado: "Enviado", detalle: "Recibo listo para imprimir en el mostrador." };
    if (canal === "Correo") {
      const smtp = config.smtp();
      if (!smtp) return { estado: "Simulado", detalle: "SMTP no configurado (SMTP_HOST); el correo no salió del sistema." };
      const transporte = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined });
      const info = await transporte.sendMail({ from: smtp.from, to: destino, subject: asunto, text: mensaje });
      return { estado: "Enviado", detalle: `Correo aceptado por el servidor SMTP (${info.messageId}).` };
    }
    const whatsapp = config.whatsapp();
    if (!whatsapp) return { estado: "Simulado", detalle: "WhatsApp Business no configurado (WHATSAPP_TOKEN); el mensaje no salió del sistema." };
    const numero = destino.replace(/\D/g, "");
    await pedir(`https://graph.facebook.com/v21.0/${whatsapp.phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${whatsapp.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: numero.length === 10 ? `52${numero}` : numero, type: "text", text: { body: `${asunto}\n\n${mensaje}` } }),
    });
    return { estado: "Enviado", detalle: "Mensaje aceptado por WhatsApp Business." };
  } catch (error) {
    return { estado: "Fallido", detalle: (error as Error).message.slice(0, 250) };
  }
}

// --- Base de datos escolar (Servicios Escolares), solo lectura -------------

export type UsuarioEscolar = { identificador: string; tipo: "Alumno" | "Profesor" | "Colaborador"; nombre: string; correo: string; telefono: string | null; activo: boolean };

export async function consultarBaseEscolar(): Promise<UsuarioEscolar[]> {
  return (await pedir<{ usuarios: UsuarioEscolar[] }>(`${config.urlEscolar()}/api/usuarios`)).usuarios;
}

export async function avisarServiciosEscolares(tipo: "Suspensión" | "Libro perdido", datos: Record<string, unknown>): Promise<ResultadoEnvio> {
  try {
    await pedir(`${config.urlEscolar()}/api/avisos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, ...datos }) });
    return { estado: "Enviado", detalle: "Aviso recibido por Servicios Escolares." };
  } catch (error) {
    return { estado: "Fallido", detalle: (error as Error).message.slice(0, 250) };
  }
}

// --- Tesorería -------------------------------------------------------------

export async function confirmarPagoTesoreria(referencia: string, montoMxn: number, identificador: string): Promise<{ confirmado: boolean; detalle: string }> {
  const respuesta = await pedir<{ confirmado: boolean; motivo?: string }>(`${config.urlTesoreria()}/api/pagos/confirmaciones`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referencia, montoMxn, identificador }),
  });
  return { confirmado: respuesta.confirmado, detalle: respuesta.motivo ?? "Pago confirmado por Tesorería." };
}

export async function avisarTesoreria(datos: { tipo: "Multa" | "Libro perdido"; identificador: string; montoMxn: number; concepto: string }): Promise<ResultadoEnvio> {
  try {
    await pedir(`${config.urlTesoreria()}/api/avisos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });
    return { estado: "Enviado", detalle: "Aviso recibido por Tesorería." };
  } catch (error) {
    return { estado: "Fallido", detalle: (error as Error).message.slice(0, 250) };
  }
}

// --- Dialogflow CX (motor de lenguaje del chatbot) -------------------------

export async function detectarIntencionDialogflow(texto: string, idSesion: string): Promise<{ intencion: string; respuesta: string } | null> {
  const df = config.dialogflow();
  if (!df) return null;
  const url = `https://${df.region}-dialogflow.googleapis.com/v3/projects/${df.proyecto}/locations/${df.region}/agents/${df.agente}/sessions/${encodeURIComponent(idSesion)}:detectIntent`;
  type Respuesta = { queryResult?: { match?: { intent?: { displayName?: string } }; responseMessages?: Array<{ text?: { text?: string[] } }> } };
  const datos = await pedir<Respuesta>(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${df.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ queryInput: { text: { text: texto }, languageCode: df.idioma } }),
  });
  const intencion = datos.queryResult?.match?.intent?.displayName;
  if (!intencion) return null;
  const respuesta = datos.queryResult?.responseMessages?.flatMap((m) => m.text?.text ?? []).join(" ") ?? "";
  return { intencion, respuesta };
}

// --- Llama en Ollama (agente del chatbot, ADR 0003) -------------------------

export type LlamadaHerramienta = { function: { name: string; arguments: Record<string, unknown> | string } };
export type MensajeLlm = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_calls?: LlamadaHerramienta[]; tool_name?: string };
export type HerramientaLlm = { type: "function"; function: { name: string; description: string; parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] } } };

/**
 * Respuestas cortas y estables; 2048 de contexto alcanza para las reglas, los datos y una búsqueda.
 * La precarga usa el mismo num_ctx: si cambia, Ollama vuelve a cargar el modelo.
 */
const OPCIONES_LLAMA = { temperature: 0.2, num_predict: 180, num_ctx: 2048 };
/** El modelo se queda en memoria todo el día: volver a cargarlo cuesta segundos en cada primera pregunta. */
const MANTENER_CARGADO = "24h";

/** Un turno del modelo (POST /api/chat de Ollama, sin streaming). null si Ollama no está configurado. */
export async function conversarConOllama(mensajes: MensajeLlm[], herramientas: HerramientaLlm[], maxTokens = OPCIONES_LLAMA.num_predict): Promise<MensajeLlm | null> {
  const ol = config.ollama();
  if (!ol) return null;
  const datos = await pedir<{ message?: MensajeLlm }>(`${ol.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ol.modelo, messages: mensajes, ...(herramientas.length ? { tools: herramientas } : {}), stream: false, keep_alive: MANTENER_CARGADO,
      options: { ...OPCIONES_LLAMA, num_predict: maxTokens },
    }),
  }, ol.tiempoLimiteMs);
  return datos.message ?? null;
}

/** Carga el modelo en memoria al arrancar para que la primera pregunta no espere la carga. */
export async function precalentarOllama(): Promise<void> {
  const ol = config.ollama();
  if (!ol) return;
  await pedir(`${ol.url}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: ol.modelo, keep_alive: MANTENER_CARGADO, options: OPCIONES_LLAMA }) }, ol.tiempoLimiteMs * 3);
}

// --- Llamadas entre microservicios -----------------------------------------

export async function llamarServicio<T>(servicio: NombreServicio, ruta: string, cuerpo: unknown): Promise<T> {
  const token = await firmarToken({ id: 0, identificador: "servicio", nombre: servicio, rol: "Servicio" }, 1);
  return pedir<T>(`${config.urlServicio(servicio, PUERTOS[servicio])}${ruta}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}
