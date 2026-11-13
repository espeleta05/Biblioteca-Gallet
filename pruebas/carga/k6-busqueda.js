/**
 * Prueba de carga (Propuesta 3.3: tiempo de respuesta ≤ 3 s con 100 usuarios
 * simultáneos, verificado con k6).
 * Uso:  k6 run -e URL=https://localhost -e USUARIO=ALU001 -e CONTRASENA=1234 pruebas/carga/k6-busqueda.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 100,
  duration: "1m",
  insecureSkipTLSVerify: true,
  thresholds: {
    http_req_duration: ["p(95)<3000"], // 95 % de las respuestas en menos de 3 s
    http_req_failed: ["rate<0.01"],
  },
};

export function setup() {
  const r = http.post(`${__ENV.URL}/api/auth/sesion`, JSON.stringify({ identificador: __ENV.USUARIO, contrasena: __ENV.CONTRASENA }), { headers: { "Content-Type": "application/json" } });
  return { token: r.json("token") };
}

const TERMINOS = ["java", "code", "software", "quijote", "demostración", ""];

export default function (datos) {
  const encabezados = { headers: { Authorization: `Bearer ${datos.token}` } };
  const q = TERMINOS[Math.floor(Math.random() * TERMINOS.length)];
  check(http.get(`${__ENV.URL}/api/busqueda?q=${encodeURIComponent(q)}`, encabezados), { "búsqueda 200": (r) => r.status === 200 });
  check(http.post(`${__ENV.URL}/api/chatbot/mensajes`, JSON.stringify({ texto: "¿Cuántos días dura un préstamo?" }), { headers: { ...encabezados.headers, "Content-Type": "application/json" } }), { "chatbot 200": (r) => r.status === 200 });
  sleep(1);
}
