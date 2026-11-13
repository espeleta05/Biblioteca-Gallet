/**
 * Desarrollo sin Docker: inicia los 8 microservicios compilados y los
 * simuladores de la base escolar y de Tesorería, con el mismo entorno.
 * Uso: npm run build && npm run inicio   (requiere DATABASE_URL y JWT_SECRET)
 */
const { spawn } = require("child_process");
const { join } = require("path");

const servicios = ["usuarios", "gestionar-libros", "buscar-libros", "prestar-libros", "devolver-libros", "gestion-multas", "alumnos-suspendidos", "chatbot"];
const procesos = [];

function iniciar(nombre, archivo, argumentos = []) {
  const proceso = spawn(process.execPath, [archivo, ...argumentos], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  const prefijo = (linea) => `[${nombre}] ${linea}`;
  proceso.stdout.on("data", (d) => String(d).trim().split("\n").forEach((l) => console.log(prefijo(l))));
  proceso.stderr.on("data", (d) => String(d).trim().split("\n").forEach((l) => console.error(prefijo(l))));
  proceso.on("exit", (codigo) => console.error(prefijo(`terminó con código ${codigo}`)));
  procesos.push(proceso);
}

for (const servicio of servicios) iniciar(servicio, join(__dirname, "..", "dist", servicio, "src", "main.js"));
iniciar("simulador-escolar", join(__dirname, "..", "dist", "simuladores", "src", "main.js"), ["escolar"]);
iniciar("simulador-tesoreria", join(__dirname, "..", "dist", "simuladores", "src", "main.js"), ["tesoreria"]);

const terminar = () => { procesos.forEach((p) => p.kill()); process.exit(0); };
process.on("SIGINT", terminar);
process.on("SIGTERM", terminar);
