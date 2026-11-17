/**
 * Configuración por variables de entorno. Se valida al arrancar para fallar
 * pronto con un mensaje claro (programación defensiva, SWEBOK 04).
 */

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}. Revisa .env.example.`);
  return valor;
}

function opcional(nombre: string): string | undefined {
  const valor = process.env[nombre];
  return valor && valor.trim() ? valor.trim() : undefined;
}

export const config = {
  get databaseUrl() { return requerida("DATABASE_URL"); },
  get jwtSecreto() {
    const secreto = requerida("JWT_SECRET");
    if (secreto.length < 32) throw new Error("JWT_SECRET debe tener al menos 32 caracteres.");
    return secreto;
  },
  /**
   * Intentos fallidos antes del bloqueo. La Propuesta 3.3 dice 5 y la HU1-SP0
   * (Evidencia 06) dice 3; se usa 3 y se cambia con INTENTOS_MAXIMOS
   * (docs/decisiones-pendientes.md).
   */
  intentosMaximos: Number(process.env.INTENTOS_MAXIMOS ?? 3),
  /** Duración del bloqueo; la propuesta no la fija (docs/decisiones-pendientes.md). */
  minutosBloqueo: Number(process.env.MINUTOS_BLOQUEO ?? 15),
  horasSesion: 8,
  urlServicio: (nombre: string, puertoLocal: number) => process.env[`URL_${nombre.toUpperCase().replace(/-/g, "_")}`] ?? `http://localhost:${puertoLocal}`,
  banxicoToken: () => opcional("BANXICO_TOKEN"),
  smtp: () => {
    const host = opcional("SMTP_HOST");
    return host
      ? { host, port: Number(process.env.SMTP_PORT ?? 587), user: opcional("SMTP_USER"), pass: opcional("SMTP_PASS"), from: opcional("SMTP_FROM") ?? "SIGEB Biblioteca <biblioteca@ducky.edu.mx>" }
      : undefined;
  },
  whatsapp: () => {
    const token = opcional("WHATSAPP_TOKEN");
    const phoneId = opcional("WHATSAPP_PHONE_NUMBER_ID");
    return token && phoneId ? { token, phoneId } : undefined;
  },
  dialogflow: () => {
    const proyecto = opcional("DIALOGFLOW_PROJECT_ID");
    const agente = opcional("DIALOGFLOW_AGENT_ID");
    const token = opcional("DIALOGFLOW_ACCESS_TOKEN");
    return proyecto && agente && token
      ? { proyecto, agente, token, region: process.env.DIALOGFLOW_LOCATION ?? "us-central1", idioma: "es" }
      : undefined;
  },
  urlEscolar: () => opcional("URL_BD_ESCOLAR") ?? "http://localhost:4101",
  urlTesoreria: () => opcional("URL_TESORERIA") ?? "http://localhost:4102",
};

/** Puertos internos de cada microservicio (uno por función del Product Backlog). */
export const PUERTOS = {
  "usuarios": 4001,
  "gestionar-libros": 4002,
  "buscar-libros": 4003,
  "prestar-libros": 4004,
  "devolver-libros": 4005,
  "gestion-multas": 4006,
  "alumnos-suspendidos": 4007,
  "chatbot": 4008,
} as const;
export type NombreServicio = keyof typeof PUERTOS;
