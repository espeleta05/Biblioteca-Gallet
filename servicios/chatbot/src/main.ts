/**
 * Microservicio "Chatbot" (Sprint 4): consulta de reglas y políticas
 * (vigencias, renovaciones, multas y costos de reposición) y de préstamos
 * vigentes, vencimientos y multas del usuario. Web y app, 24 horas.
 * Motores: Dialogflow CX (Google Cloud) si está configurado; si no, el
 * clasificador local sobre la base de conocimiento CHATBOT_REGLAS.
 */
import "reflect-metadata";
import { Body, Controller, Get, HttpCode, Injectable, Module, type OnApplicationBootstrap, Post } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import type { Sesion } from "../../comun/auth";
import { formatoPesos } from "../../comun/avisos";
import { PUERTOS } from "../../comun/config";
import { consultar, obtenerPool } from "../../comun/db";
import { contextoPersona, ejecutarAgente, instrucciones, necesitaBuscarLibros, politicaRelacionada, redactarBusqueda, type DatosPersona, type Herramientas, type LibroEncontrado } from "../../comun/dominio/agente";
import { clasificar, reglaSegura, RESPUESTA_AYUDA, RESPUESTA_DESCONOCIDA, type IntencionPersonal, type ReglaConocimiento } from "../../comun/dominio/chatbot";
import { hoyEnBiblioteca } from "../../comun/dominio/fechas";
import { conversarConOllama, detectarIntencionDialogflow, precalentarOllama } from "../../comun/integraciones";
import { iniciarServicio, UsuarioActual } from "../../comun/nest";

export class MensajeDto { @IsString() @Length(1, 300, { message: "Escribe una pregunta de hasta 300 caracteres." }) texto!: string; }

/** Intenciones del agente de Dialogflow CX que equivalen a consultas personales. */
const INTENCIONES_DIALOGFLOW: Record<string, IntencionPersonal> = { "consultar.prestamos": "mis_prestamos", "consultar.vencimientos": "mis_vencimientos", "consultar.multas": "mis_multas" };

@Injectable()
export class ServicioChatbot implements OnApplicationBootstrap {
  /** Carga Llama en memoria al arrancar (sin esperar): la primera pregunta no paga la carga del modelo. */
  onApplicationBootstrap() {
    void this.precalentar().catch((error: Error) => console.warn("[chatbot] No se pudo precargar Llama:", error.message));
  }

  /** Carga el modelo y procesa las instrucciones fijas una vez: Ollama reutiliza ese inicio en cada pregunta. */
  private async precalentar() {
    await precalentarOllama();
    await conversarConOllama([{ role: "system", content: instrucciones(await this.reglas()) }, { role: "user", content: "Hola" }], [], 1);
  }

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

  /** Préstamos y multas de quien pregunta, leídos con su sesión (nunca con lo que escribe). */
  private async datosPersona(sesion: Sesion): Promise<DatosPersona> {
    const hoy = hoyEnBiblioteca();
    const esPersonal = sesion.rol === "Administrador" || sesion.rol === "Bibliotecario" || sesion.rol === "Servicio";
    if (esPersonal) return { nombre: sesion.nombre, rol: sesion.rol, hoy, esPersonal, prestamos: [], multas: [] };
    const [prestamos, multas] = await Promise.all([
      consultar<{ titulo: string; vence: string; renovaciones: number }>(`
        SELECT l.titulo, p.fecha_vencimiento::text AS vence, (SELECT COUNT(*)::int FROM RENOVACIONES r WHERE r.id_prestamo = p.id_prestamo) AS renovaciones
        FROM PRESTAMOS p JOIN EJEMPLARES e ON e.id_ejemplar = p.id_ejemplar JOIN LIBROS l ON l.id_libro = e.id_libro
        WHERE p.id_credencial = $1 AND p.estado = 'Activo' ORDER BY p.fecha_vencimiento`, [sesion.id]),
      consultar<{ motivo: string; montoMxn: number }>(
        "SELECT motivo, monto_mxn::float AS \"montoMxn\" FROM MULTAS WHERE id_credencial = $1 AND estatus = 'Pendiente' ORDER BY fecha_generacion", [sesion.id]),
    ]);
    return { nombre: sesion.nombre, rol: sesion.rol, hoy, esPersonal, prestamos: prestamos.map((p) => ({ ...p, vencido: p.vence < hoy })), multas };
  }

  /** Herramienta del agente: búsqueda en el catálogo (ADR 0003). */
  private herramientas(): Herramientas {
    return {
      buscar_libros: async ({ texto }) => {
        const q = typeof texto === "string" ? texto.trim() : "";
        if (q.length < 3) return { error: "Escribe por lo menos 3 caracteres del título, autor o tema." };
        const libros = await consultar<LibroEncontrado>(`
          SELECT l.titulo, l.tipo_uso AS "tipoUso",
                 (SELECT string_agg(a.nombre_autor, ', ') FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro) AS autores,
                 COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Disponible')::int AS disponibles,
                 COALESCE(json_agg(DISTINCT COALESCE(e.piso || ', área ' || e.area || ', pasillo ' || e.pasillo || ', estante ' || e.estante, 'un lugar sin ubicación registrada (pregunta en el mostrador)'))
                   FILTER (WHERE e.estado = 'Disponible'), '[]') AS ubicaciones,
                 (SELECT MIN(p.fecha_vencimiento)::text FROM PRESTAMOS p JOIN EJEMPLARES x ON x.id_ejemplar = p.id_ejemplar WHERE x.id_libro = l.id_libro AND p.estado = 'Activo') AS "proximaDevolucion"
          FROM LIBROS l JOIN TEMAS t ON t.id_tema = l.id_tema JOIN EJEMPLARES e ON e.id_libro = l.id_libro AND e.estado <> 'Dado de baja'
          WHERE sin_acentos(l.titulo) LIKE '%' || sin_acentos($1) || '%' OR sin_acentos(t.nombre_tema) LIKE '%' || sin_acentos($1) || '%'
             OR EXISTS (SELECT 1 FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro AND sin_acentos(a.nombre_autor) LIKE '%' || sin_acentos($1) || '%')
          GROUP BY l.id_libro ORDER BY disponibles DESC, l.titulo LIMIT 5`, [q]);
        return { respuestaDirecta: redactarBusqueda(q, libros) };
      },
    };
  }

  /** Pregunta abierta → agente con Llama; null si Ollama no está o no respondió a tiempo. */
  private async preguntarAlAgente(texto: string, sesion: Sesion, reglas: ReglaConocimiento[], relacionada?: ReglaConocimiento) {
    try {
      // Instrucciones fijas primero (Ollama reutiliza ese inicio entre preguntas), luego los datos de
      // la persona y, si el clasificador la encontró, la política que corresponde a la pregunta.
      const sistema = [instrucciones(reglas), contextoPersona(await this.datosPersona(sesion)), ...(relacionada ? [politicaRelacionada(relacionada)] : [])];
      return await ejecutarAgente(texto, sistema, conversarConOllama, this.herramientas(), { conHerramientas: necesitaBuscarLibros(texto) });
    } catch (error) {
      console.warn("[chatbot] Llama (Ollama) no respondió; se usa el clasificador local:", (error as Error).message);
      return null;
    }
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
      const reglas = await this.reglas();
      const clasificacion = clasificar(texto, reglas);
      // Lo que el clasificador reconoce con seguridad se responde al instante (RNF de 3 s);
      // las preguntas abiertas o ambiguas van al agente con Llama.
      // Las políticas salen con su texto exacto; solo una búsqueda de libros pasa al agente aunque mencione una política.
      const segura = clasificacion.tipo === "personal" || clasificacion.tipo === "ayuda"
        || (clasificacion.tipo === "regla" && reglaSegura(clasificacion) && !necesitaBuscarLibros(texto));
      const agente = segura ? null : await this.preguntarAlAgente(texto, sesion, reglas, clasificacion.tipo === "regla" ? clasificacion.regla : undefined);
      if (agente) {
        motor = "Llama 3.2 (Ollama)";
        intencion = (agente.herramientas.length ? `agente:${[...new Set(agente.herramientas)].join("+")}` : "agente").slice(0, 40);
        respuesta = agente.respuesta;
      } else {
        if (clasificacion.tipo === "personal") { intencion = clasificacion.intencion; respuesta = await this.respuestaPersonal(clasificacion.intencion, sesion); }
        if (clasificacion.tipo === "regla") { intencion = `regla:${clasificacion.regla.tema}`; respuesta = clasificacion.regla.respuesta; }
        if (clasificacion.tipo === "ayuda") { intencion = "ayuda"; respuesta = RESPUESTA_AYUDA; }
      }
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
