/**
 * Simuladores de sistemas externos para el ambiente de pruebas (Propuesta 3.5:
 * "pruebas de integración en ambiente de pruebas"). SIGEB no modifica los sistemas
 * de la Universidad (9.3); en producción las URL apuntan a los reales:
 *  - Base de datos escolar (Servicios Escolares): API de solo lectura + avisos.
 *  - Tesorería: confirmación de pagos de multas + avisos de libros perdidos.
 * Contrato documentado en docs/api/integraciones.md.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";

type Aviso = Record<string, unknown> & { recibido: string };

function leerCuerpo(solicitud: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolver, rechazar) => {
    let texto = "";
    solicitud.on("data", (parte) => { texto += parte; });
    solicitud.on("end", () => { try { resolver(texto ? JSON.parse(texto) : {}); } catch { rechazar(new Error("JSON inválido")); } });
  });
}

function responder(respuesta: ServerResponse, estado: number, cuerpo: unknown): void {
  respuesta.writeHead(estado, { "Content-Type": "application/json; charset=utf-8" });
  respuesta.end(JSON.stringify(cuerpo));
}

const pad = (n: number, largo = 3) => String(n).padStart(largo, "0");

/** Padrón escolar de prueba: coincide con db/datos-prueba.sql, más un alumno nuevo y uno dado de baja. */
export function padronEscolar() {
  const alumnos = Array.from({ length: 101 }, (_, i) => ({ identificador: `ALU${pad(i + 1)}`, tipo: "Alumno", nombre: `Alumno ALU${pad(i + 1)}`, correo: `alu${pad(i + 1)}@ducky.edu.mx`, telefono: `81820${pad(i + 1, 5)}`, activo: i + 1 !== 100 }));
  const profesores = Array.from({ length: 20 }, (_, i) => ({ identificador: `PROF${pad(i + 1)}`, tipo: "Profesor", nombre: `Profesor PROF${pad(i + 1)}`, correo: `prof${pad(i + 1)}@ducky.edu.mx`, telefono: `81821${pad(i + 1, 5)}`, activo: true }));
  const colaboradores = Array.from({ length: 5 }, (_, i) => ({ identificador: `COL${pad(i + 1)}`, tipo: "Colaborador", nombre: `Colaborador COL${pad(i + 1)}`, correo: `col${pad(i + 1)}@ducky.edu.mx`, telefono: `81822${pad(i + 1, 5)}`, activo: true }));
  return [...alumnos, ...profesores, ...colaboradores];
}

export function crearSimuladorEscolar(): Server & { avisos: Aviso[] } {
  const avisos: Aviso[] = [];
  const servidor = createServer(async (solicitud, respuesta) => {
    try {
      if (solicitud.method === "GET" && solicitud.url === "/api/usuarios") return responder(respuesta, 200, { usuarios: padronEscolar() });
      if (solicitud.method === "POST" && solicitud.url === "/api/avisos") {
        const cuerpo = await leerCuerpo(solicitud);
        if (!cuerpo.tipo) return responder(respuesta, 400, { error: "Falta el tipo de aviso." });
        avisos.push({ ...cuerpo, recibido: new Date().toISOString() });
        return responder(respuesta, 201, { ok: true });
      }
      if (solicitud.method === "GET" && solicitud.url === "/api/avisos") return responder(respuesta, 200, { avisos });
      if (solicitud.url === "/salud") return responder(respuesta, 200, { servicio: "simulador-escolar", estado: "ok" });
      return responder(respuesta, 404, { error: "Ruta no encontrada." });
    } catch (error) {
      return responder(respuesta, 400, { error: (error as Error).message });
    }
  });
  return Object.assign(servidor, { avisos });
}

/**
 * Tesorería confirma un pago cuando la referencia tiene el formato de sus recibos
 * (TES-######) y el monto es positivo. Una referencia no puede usarse dos veces.
 */
export function crearSimuladorTesoreria(): Server & { avisos: Aviso[] } {
  const avisos: Aviso[] = [];
  const usadas = new Set<string>();
  const servidor = createServer(async (solicitud, respuesta) => {
    try {
      if (solicitud.method === "POST" && solicitud.url === "/api/pagos/confirmaciones") {
        const { referencia, montoMxn } = await leerCuerpo(solicitud) as { referencia?: string; montoMxn?: number };
        if (!referencia || !/^TES-\d{6}$/.test(referencia)) return responder(respuesta, 200, { confirmado: false, motivo: `La referencia "${referencia ?? ""}" no existe en Tesorería (formato TES-######).` });
        if (usadas.has(referencia)) return responder(respuesta, 200, { confirmado: false, motivo: `La referencia ${referencia} ya se aplicó a otro pago.` });
        if (!montoMxn || montoMxn <= 0) return responder(respuesta, 200, { confirmado: false, motivo: "Monto inválido." });
        usadas.add(referencia);
        return responder(respuesta, 200, { confirmado: true });
      }
      if (solicitud.method === "POST" && solicitud.url === "/api/avisos") {
        avisos.push({ ...(await leerCuerpo(solicitud)), recibido: new Date().toISOString() });
        return responder(respuesta, 201, { ok: true });
      }
      if (solicitud.method === "GET" && solicitud.url === "/api/avisos") return responder(respuesta, 200, { avisos });
      if (solicitud.url === "/salud") return responder(respuesta, 200, { servicio: "simulador-tesoreria", estado: "ok" });
      return responder(respuesta, 404, { error: "Ruta no encontrada." });
    } catch (error) {
      return responder(respuesta, 400, { error: (error as Error).message });
    }
  });
  return Object.assign(servidor, { avisos });
}

if (require.main === module) {
  const cual = process.argv[2];
  const puerto = Number(process.env.PORT ?? (cual === "tesoreria" ? 4102 : 4101));
  (cual === "tesoreria" ? crearSimuladorTesoreria() : crearSimuladorEscolar()).listen(puerto, () => console.log(`[simulador-${cual ?? "escolar"}] escuchando en ${puerto}`));
}
