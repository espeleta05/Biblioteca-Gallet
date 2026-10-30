import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export type Role = "Administrador" | "Bibliotecario" | "Alumno" | "Profesor";
export type Session = { id: string; identifier: string; name: string; role: Role };

const COOKIE_NAME = "sigeb_session";
const secret = () => process.env.AUTH_SECRET || "sigeb-local-session-secret";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expected] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSession(session: Session) {
  const value = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${value}.${sign(value)}`;
}

export function readSession(value?: string): Session | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    return session.id && session.identifier && session.name && session.role ? session : null;
  } catch {
    return null;
  }
}

export async function getSession() {
  return readSession((await cookies()).get(COOKIE_NAME)?.value);
}

export const sessionCookie = COOKIE_NAME;
