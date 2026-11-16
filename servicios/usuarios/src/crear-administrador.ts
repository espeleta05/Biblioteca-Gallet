/**
 * Crea el primer Administrador de biblioteca en producción, donde no se cargan
 * cuentas de prueba (docs/despliegue.md). La contraseña llega por la variable de
 * entorno CONTRASENA_ADMIN para que no quede en el historial de la terminal.
 *
 * Uso (en el servidor):
 *   docker compose exec -e CONTRASENA_ADMIN usuarios \
 *     node dist/usuarios/src/crear-administrador.js <nómina> "<nombre completo>" <correo>
 */
import { cifrarContrasena } from "../../comun/contrasenas";
import { cerrarPool, consultarUno, enTransaccion, registrarEnBitacora } from "../../comun/db";

export async function crearAdministrador(nomina: string, nombre: string, correo: string, contrasena: string): Promise<number> {
  const problemas: string[] = [];
  if (!/^[A-Za-z0-9-]{3,20}$/.test(nomina)) problemas.push("La nómina solo admite letras, números y guiones (3 a 20).");
  if (nombre.trim().length < 3) problemas.push("Escribe el nombre completo.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) problemas.push("El correo institucional no es válido.");
  if (contrasena.length < 12) problemas.push("La contraseña debe tener al menos 12 caracteres.");
  if (problemas.length) throw new Error(`No se creó el administrador:\n- ${problemas.join("\n- ")}`);

  return enTransaccion(async (cliente) => {
    const existente = await consultarUno("SELECT 1 FROM CREDENCIALES WHERE LOWER(matricula_nomina) = LOWER($1)", [nomina], cliente);
    if (existente) throw new Error(`No se creó el administrador: la nómina ${nomina} ya existe.`);
    const credencial = await consultarUno<{ id_credencial: number }>(
      "INSERT INTO CREDENCIALES (id_rol, matricula_nomina, contrasena_hash) VALUES ((SELECT id_rol FROM ROLES WHERE nombre_rol = 'Administrador'), $1, $2) RETURNING id_credencial",
      [nomina, cifrarContrasena(contrasena)], cliente);
    await cliente.query("INSERT INTO PERSONAL_BIBLIOTECA (id_credencial, nombre_completo, correo_institucional) VALUES ($1, $2, $3)",
      [credencial!.id_credencial, nombre.trim(), correo.trim()]);
    await registrarEnBitacora(cliente, "usuarios", "Alta del primer administrador", `${nomina} (despliegue)`);
    return credencial!.id_credencial;
  });
}

if (require.main === module) {
  const [nomina, nombre, correo] = process.argv.slice(2);
  const contrasena = process.env.CONTRASENA_ADMIN ?? "";
  if (!nomina || !nombre || !correo) {
    console.error('Uso: CONTRASENA_ADMIN=... node dist/usuarios/src/crear-administrador.js <nómina> "<nombre completo>" <correo>');
    process.exit(2);
  }
  crearAdministrador(nomina, nombre, correo, contrasena)
    .then((id) => console.log(`Administrador ${nomina} creado (credencial ${id}). Ya puede iniciar sesión.`))
    .catch((error: Error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => void cerrarPool());
}
