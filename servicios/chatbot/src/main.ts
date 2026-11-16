/**
 * Microservicio "Chatbot" (Sprint 4): consulta de reglas y políticas
 * (vigencias, renovaciones, multas y costos de reposición) y de préstamos
 * vigentes, vencimientos y multas del usuario. Web y app, 24 horas.
 * Motor: Dialogflow CX (Google Cloud) si está configurado; si no, el
 * clasificador local sobre la base de conocimiento CHATBOT_REGLAS.
 */
import "reflect-metadata";
import { Body, Controller, Get, HttpCode, Injectable, Module, Post } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import type { Sesion } from "../../comun/auth";
import { formatoPesos } from "../../comun/avisos";
import { PUERTOS } from "../../comun/config";
import { consultar, obtenerPool } from "../../comun/db";
import { clasificar, RESPUESTA_AYUDA, RESPUESTA_DESCONOCIDA, type IntencionPersonal, type ReglaConocimiento } from "../../comun/dominio/chatbot";
import { hoyEnBiblioteca } from "../../comun/dominio/fechas";
import { detectarIntencionDialogflow } from "../../comun/integraciones";
import { iniciarServicio, UsuarioActual } from "../../comun/nest";

export class MensajeDto { @IsString() @Length(1, 300, { message: "Escribe una pregunta de hasta 300 caracteres." }) texto!: string; }

/** Intenciones del agente de Dialogflow CX que equivalen a consultas personales. */
const INTENCIONES_DIALOGFLOW: Record<string, IntencionPersonal> = { "consultar.prestamos": "mis_prestamos", "consultar.vencimientos": "mis_vencimientos", "consultar.multas": "mis_multas" };

@Injectable()
export class ServicioChatbot {
  private reglas(): Promise<ReglaConocimiento[]> {
    return consultar<ReglaConocimiento>(`SELECT id_regla AS id, tema, palabras_clave AS "palabrasClave", respuesta_bot AS respuesta FROM CHATBOT_REGLAS`);
  }

  private async respuestaPersonal(intencion: IntencionPersonal, sesion: Sesion): Promise<string> {
    if (sesion.rol === "Administrador" || sesion.rol === "Bibliotecario") return "Esta consulta es para alumnos, profesores y colaboradores. Revisa la sección de préstamos para ver los de cualquier usuario.";
    if (intencion === "mis_multas") {
      const multas = await consultar<{ motivo: string; monto: number }>("SELECT motivo, monto_mxn AS monto FROM MULTAS WHERE id_credencial = $1 AND estatus = 'Pendiente' ORDER BY fecha_generacion", [sesion.id]);
      if (!multas.length) return "No tienes multas pendientes.";
      const total = multas.reduce((s, m) => s + m.monto, 0);
      return `Tienes ${multas.length} multa(s) pendiente(s) por ${formatoPesos(total)}: ${multas.map((m) => `${m.motivo.toLowerCase()} ${formatoPesos(m.monto)}`).join(", ")}. Págalas en Tesorería.`;
    }
    const prestamos = await consultar<{ titulo: string; vencimiento: string; renovaciones: number }>(`
      SELECT l.titulo, p.fecha_vencimiento AS vencimiento, (SELECT COUNT(*)::int FROM RENOVACIONES r WHERE r.id_prestamo = p.id_prestamo) AS renovaciones
      FROM PRESTAMOS p JOIN EJEMPLARES e ON e.id_ejemplar = p.id_ejemplar JOIN LIBROS l ON l.id_libro = e.id_libro
      WHERE p.id_credencial = $1 AND p.estado = 'Activo' ORDER BY p.fecha_vencimiento`, [sesion.id]);
    if (!prestamos.length) return "No tienes préstamos vigentes.";
    const hoy = hoyEnBiblioteca();
    const lineas = prestamos.map((p) => `"${p.titulo}" ${p.vencimiento < hoy ? `venció el ${p.vencimiento}` : `vence el ${p.vencimiento}`}${intencion === "mis_prestamos" ? ` (${p.renovaciones} renovación(es))` : ""}`);
    return `Tienes ${prestamos.length} préstamo(s) vigente(s): ${lineas.join("; ")}.`;
  }

  async responder(texto: string, sesion: Sesion) {
    let motor = "Clasificador local";
    let intencion = "desconocida";
    let respuesta = RESPUESTA_DESCONOCIDA;
    let dialogflow: Awaited<ReturnType<typeof detectarIntencionDialogflow>> = null;
    try {
      dialogflow = await detectarIntencionDialogflow(texto, `sigeb-${sesion.id}`);
    } catch (error) {
      console.warn("[chatbot] Dialogflow no respondió; se usa el clasificador local:", (error as Error).message);
    }
    if (dialogflow) {
      motor = "Dialogflow CX";
      intencion = dialogflow.intencion;
      const personal = INTENCIONES_DIALOGFLOW[dialogflow.intencion];
      respuesta = personal ? await this.respuestaPersonal(personal, sesion) : dialogflow.respuesta || RESPUESTA_DESCONOCIDA;
    } else {
      const clasificacion = clasificar(texto, await this.reglas());
      if (clasificacion.tipo === "personal") { intencion = clasificacion.intencion; respuesta = await this.respuestaPersonal(clasificacion.intencion, sesion); }
      if (clasificacion.tipo === "regla") { intencion = `regla:${clasificacion.regla.tema}`; respuesta = clasificacion.regla.respuesta; }
      if (clasificacion.tipo === "ayuda") { intencion = "ayuda"; respuesta = RESPUESTA_AYUDA; }
    }
    if (sesion.rol !== "Servicio") {
      await obtenerPool().query("INSERT INTO CHATBOT_LOGS (id_credencial, pregunta_usuario, intencion, respuesta_generada, motor) VALUES ($1, $2, $3, $4, $5)", [sesion.id, texto, intencion, respuesta, motor]);
    }
    return { respuesta, intencion, motor };
  }

  sugerencias() {
    return consultar("SELECT tema, pregunta_frecuente AS pregunta FROM CHATBOT_REGLAS ORDER BY id_regla");
  }
}

@Controller("api/chatbot")
export class ControladorChatbot {
  constructor(private readonly chatbot: ServicioChatbot) {}
  @Post("mensajes") @HttpCode(200) responder(@Body() d: MensajeDto, @UsuarioActual() sesion: Sesion) { return this.chatbot.responder(d.texto, sesion); }
  @Get("sugerencias") sugerencias() { return this.chatbot.sugerencias(); }
}

@Module({ controllers: [ControladorChatbot], providers: [ServicioChatbot] })
export class ModuloChatbot {}

if (require.main === module) void iniciarServicio(ModuloChatbot, "chatbot", PUERTOS.chatbot);
