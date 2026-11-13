/** Contraseñas cifradas con scrypt y sal aleatoria (Propuesta 3.2, Seguridad). */
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function cifrarContrasena(contrasena: string): string {
  const sal = randomBytes(16).toString("hex");
  return `scrypt$${sal}$${scryptSync(contrasena, sal, 64).toString("hex")}`;
}

export function verificarContrasena(contrasena: string, guardada: string): boolean {
  const [algoritmo, sal, esperado] = guardada.split("$");
  if (algoritmo !== "scrypt" || !sal || !esperado) return false;
  const calculado = scryptSync(contrasena, sal, 64);
  const esperadoBuffer = Buffer.from(esperado, "hex");
  return calculado.length === esperadoBuffer.length && timingSafeEqual(calculado, esperadoBuffer);
}
