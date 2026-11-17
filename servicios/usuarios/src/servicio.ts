import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { enviarYRegistrar } from "../../comun/avisos";
import { firmarToken, type Permiso, type Sesion } from "../../comun/auth";
import { config } from "../../comun/config";
import { cifrarContrasena, verificarContrasena } from "../../comun/contrasenas";
import { consultar, consultarUno, enTransaccion, obtenerPool, registrarCambios, registrarEnBitacora } from "../../comun/db";
import type { RolUsuario } from "../../comun/dominio/politicas";
import { consultarBaseEscolar } from "../../comun/integraciones";
import { DatosInvalidos, ErrorDeNegocio, NoEncontrado } from "../../comun/nest";
import type { AsignarPerfilDto, BajaCuentaDto, CambiosCuentaDto, FiltroUsuariosDto, NuevaCuentaDto, NuevoPerfilDto } from "./dto";

type FilaCredencial = {
  id_credencial: number; matricula_nomina: string; contrasena_hash: string; estatus: string;
  intentos_fallidos: number; bloqueado_hasta: Date | null; nombre_rol: RolUsuario; nombre: string | null; activo_en_escuela: boolean | null;
  perfil: string; permisos: Permiso[]; minutos_bloqueo: number | null;
};

/** Perfil efectivo de una cuenta: el asignado o, si no tiene, el perfil base de su tipo de cuenta. */
const JOIN_PERFIL = `LEFT JOIN PERFILES pf ON pf.id_perfil = COALESCE(c.id_perfil, (SELECT b.id_perfil FROM PERFILES b WHERE b.nombre = r.nombre_rol AND b.es_base))`;
const SERVICIO = "usuarios";
const ES_PERSONAL = (rol: string) => rol === "Administrador" || rol === "Bibliotecario";

export const NO_REGISTRADO = "Usuario no registrado o inactivo. Acude con el administrador de la Biblioteca para verificar tu situación.";
export const SOLO_ADMIN_DATOS = "Solo el administrador puede cambiar estos datos, por lo que debes acudir a la Biblioteca.";

const mensajeBloqueo = (minutos: number) => `Tu cuenta se bloqueó por varios intentos fallidos. Intenta de nuevo en ${minutos} minuto${minutos === 1 ? "" : "s"}.`;

@Injectable()
export class ServicioUsuarios {
  // ── Autenticación (HU1-SP0) ────────────────────────────────────────────────
  async iniciarSesion(identificador: string, contrasena: string): Promise<{ sesion: Sesion; token: string }> {
    const usuario = await consultarUno<FilaCredencial>(`
      SELECT c.id_credencial, c.matricula_nomina, c.contrasena_hash, c.estatus, c.intentos_fallidos, c.bloqueado_hasta,
             r.nombre_rol, COALESCE(e.nombre_completo, p.nombre_completo) AS nombre, e.activo_en_escuela,
             pf.nombre AS perfil, pf.permisos,
             -- El bloqueo se compara en la base de datos (misma zona horaria que lo guardó).
             CEIL(EXTRACT(EPOCH FROM (c.bloqueado_hasta - CURRENT_TIMESTAMP)) / 60)::int AS minutos_bloqueo
      FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol
      LEFT JOIN USUARIOS_ESCOLARES e ON e.id_credencial = c.id_credencial
      LEFT JOIN PERSONAL_BIBLIOTECA p ON p.id_credencial = c.id_credencial
      ${JOIN_PERFIL}
      WHERE LOWER(c.matricula_nomina) = LOWER(TRIM($1))`, [identificador]);

    // Escenario 3: la clave no existe.
    if (!usuario) throw new HttpException({ error: NO_REGISTRADO }, HttpStatus.UNAUTHORIZED);
    // Escenario 4: ya está bloqueada.
    if (usuario.minutos_bloqueo !== null && usuario.minutos_bloqueo > 0) {
      throw new HttpException({ error: mensajeBloqueo(usuario.minutos_bloqueo) }, HttpStatus.LOCKED);
    }
    // Escenario 2: contraseña incorrecta; se suma el intento y al llegar al máximo se bloquea.
    if (!verificarContrasena(contrasena, usuario.contrasena_hash)) {
      const intentos = usuario.intentos_fallidos + 1;
      if (intentos >= config.intentosMaximos) {
        await obtenerPool().query(`UPDATE CREDENCIALES SET intentos_fallidos = 0, bloqueado_hasta = CURRENT_TIMESTAMP + make_interval(mins => $2) WHERE id_credencial = $1`, [usuario.id_credencial, config.minutosBloqueo]);
        await registrarEnBitacora(obtenerPool(), SERVICIO, "Cuenta bloqueada", `${usuario.matricula_nomina}: ${intentos} intentos fallidos`, usuario.id_credencial);
        throw new HttpException({ error: mensajeBloqueo(config.minutosBloqueo) }, HttpStatus.LOCKED);
      }
      await obtenerPool().query("UPDATE CREDENCIALES SET intentos_fallidos = $2 WHERE id_credencial = $1", [usuario.id_credencial, intentos]);
      throw new HttpException({ error: "Usuario o contraseña incorrectos." }, HttpStatus.UNAUTHORIZED);
    }
    // Escenario 3: cuenta dada de baja.
    if (usuario.estatus !== "Activa") throw new HttpException({ error: NO_REGISTRADO }, HttpStatus.FORBIDDEN);
    if (usuario.activo_en_escuela === false) throw new HttpException({ error: "La base de datos escolar indica que ya no estás activo en la Universidad." }, HttpStatus.FORBIDDEN);

    await obtenerPool().query("UPDATE CREDENCIALES SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_credencial = $1", [usuario.id_credencial]);
    // Escenario 1: el perfil y sus permisos viajan en el token.
    const sesion: Sesion = { id: usuario.id_credencial, identificador: usuario.matricula_nomina, nombre: usuario.nombre ?? usuario.matricula_nomina, rol: usuario.nombre_rol, perfil: usuario.perfil, permisos: usuario.permisos };
    return { sesion, token: await firmarToken(sesion) };
  }

  /** Una cuenta dada de baja pierde sus sesiones abiertas (HU3-SP0): el gateway lo revisa en cada petición. */
  async cuentaActiva(id: number): Promise<boolean> {
    const fila = await consultarUno<{ estatus: string }>("SELECT estatus FROM CREDENCIALES WHERE id_credencial = $1", [id]);
    return fila?.estatus === "Activa";
  }

  // ── Consulta de cuentas (HU5-SP0) ──────────────────────────────────────────
  async listar(filtro: FiltroUsuariosDto) {
    const q = filtro.q?.trim() || null;
    if (!q && !filtro.rol && !filtro.estatus) throw new DatosInvalidos("Captura una clave o nombre o elige un filtro para buscar.", [], ["q"]);
    return consultar(`
      SELECT c.id_credencial AS id, c.matricula_nomina AS identificador, r.nombre_rol AS rol, c.estatus, pf.nombre AS perfil,
             COALESCE(e.nombre_completo, p.nombre_completo) AS nombre,
             COALESCE(e.correo_institucional, p.correo_institucional) AS correo,
             COALESCE(e.telefono, p.telefono) AS telefono,
             e.activo_en_escuela AS "activoEnEscuela", e.verificado_en AS "verificadoEn",
             c.fecha_baja AS "fechaBaja", c.motivo_baja AS "motivoBaja", quien.matricula_nomina AS "bajaPor",
             EXISTS (SELECT 1 FROM SUSPENSIONES s WHERE s.id_credencial = c.id_credencial AND s.estado = 'Activa') AS suspendido
      FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol
      LEFT JOIN USUARIOS_ESCOLARES e ON e.id_credencial = c.id_credencial
      LEFT JOIN PERSONAL_BIBLIOTECA p ON p.id_credencial = c.id_credencial
      LEFT JOIN CREDENCIALES quien ON quien.id_credencial = c.id_credencial_baja
      ${JOIN_PERFIL}
      WHERE ($1::text IS NULL OR r.nombre_rol = $1)
        AND ($2::text IS NULL OR c.estatus = $2)
        AND ($3::text IS NULL OR CONCAT_WS(' ', c.matricula_nomina, e.nombre_completo, p.nombre_completo, e.correo_institucional, p.correo_institucional) ILIKE '%' || $3 || '%')
      ORDER BY r.id_rol, nombre`, [filtro.rol ?? null, filtro.estatus ?? null, q]);
  }

  // ── Alta de cuentas (HU2-SP0) ──────────────────────────────────────────────
  async crearCuenta(datos: NuevaCuentaDto, autor: Sesion) {
    const clave = datos.identificador.trim();
    const creada = await enTransaccion(async (cliente) => {
      const duplicada = await consultarUno("SELECT 1 FROM CREDENCIALES WHERE LOWER(matricula_nomina) = LOWER($1)", [clave], cliente);
      if (duplicada) throw new ErrorDeNegocio(`Ya existe una cuenta con la clave ${clave}.`, [], ["identificador"]);
      const credencial = await consultarUno<{ id_credencial: number }>(`
        INSERT INTO CREDENCIALES (id_rol, matricula_nomina, contrasena_hash)
        VALUES ((SELECT id_rol FROM ROLES WHERE nombre_rol = $1), $2, $3) RETURNING id_credencial`,
        [datos.rol, clave, cifrarContrasena(datos.contrasena)], cliente);
      const id = credencial!.id_credencial;
      if (ES_PERSONAL(datos.rol)) {
        await cliente.query("INSERT INTO PERSONAL_BIBLIOTECA (id_credencial, nombre_completo, correo_institucional, telefono) VALUES ($1, $2, $3, $4)",
          [id, datos.nombre.trim(), datos.correo.trim(), datos.telefono ?? null]);
      } else {
        await cliente.query("INSERT INTO USUARIOS_ESCOLARES (id_credencial, tipo, nombre_completo, correo_institucional, telefono) VALUES ($1, $2, $3, $4, $5)",
          [id, datos.rol, datos.nombre.trim(), datos.correo.trim(), datos.telefono ?? null]);
      }
      await registrarEnBitacora(cliente, SERVICIO, "Alta de cuenta", `${datos.rol} ${clave}`, autor.id);
      return id;
    });
    // La contraseña temporal se envía por correo después de confirmar la transacción.
    const aviso = await enviarYRegistrar({
      idCredencial: creada, tipo: "Alta de cuenta", canal: "Correo", asunto: "Tu cuenta de la Biblioteca (SIGEB)",
      mensaje: `Hola, ${datos.nombre.trim()}. Se creó tu cuenta de la Biblioteca con la clave ${clave}. Tu contraseña temporal es: ${datos.contrasena}`,
    }).catch((e: Error) => ({ estado: "Fallido", detalle: e.message, destino: datos.correo }));
    return { id: creada, clave, mensaje: `Cuenta creada con clave ${clave}.`, correo: { estado: aviso.estado, destino: aviso.destino } };
  }

  // ── Baja de cuentas (HU3-SP0) ──────────────────────────────────────────────
  async darDeBaja(datos: BajaCuentaDto, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const cuenta = await consultarUno<{ id_credencial: number; matricula_nomina: string; estatus: string }>(
        "SELECT id_credencial, matricula_nomina, estatus FROM CREDENCIALES WHERE LOWER(matricula_nomina) = LOWER(TRIM($1)) FOR UPDATE", [datos.identificador], cliente);
      if (!cuenta) throw new ErrorDeNegocio("La cuenta no existe.", [], ["identificador"]);
      if (cuenta.id_credencial === autor.id) throw new ErrorDeNegocio("No puedes dar de baja tu propia cuenta.");
      if (cuenta.estatus === "Inactiva") throw new ErrorDeNegocio("La cuenta ya está dada de baja.");
      const pendientes = await consultar<{ texto: string }>(`
        SELECT 'Préstamo: ' || l.titulo || ' (vence ' || to_char(p.fecha_vencimiento, 'DD/MM/YYYY') || ')' AS texto
        FROM PRESTAMOS p JOIN EJEMPLARES e ON e.id_ejemplar = p.id_ejemplar JOIN LIBROS l ON l.id_libro = e.id_libro
        WHERE p.id_credencial = $1 AND p.estado = 'Activo'
        UNION ALL
        SELECT 'Multa por ' || lower(m.motivo) || ': $' || to_char(m.monto_mxn, 'FM999,990.00') FROM MULTAS m
        WHERE m.id_credencial = $1 AND m.estatus = 'Pendiente'`, [cuenta.id_credencial], cliente);
      if (pendientes.length) {
        throw new ErrorDeNegocio("No se puede dar de baja la cuenta porque el usuario tiene pendientes con la Biblioteca.", pendientes.map((p) => p.texto));
      }
      await cliente.query(`UPDATE CREDENCIALES SET estatus = 'Inactiva', fecha_baja = CURRENT_TIMESTAMP, motivo_baja = $2, id_credencial_baja = $3
        WHERE id_credencial = $1`, [cuenta.id_credencial, datos.motivo.trim(), autor.id]);
      await registrarCambios(cliente, "Cuenta", cuenta.id_credencial, [["estatus", "Activa", "Inactiva"], ["motivo de baja", null, datos.motivo.trim()]], autor.id);
      await registrarEnBitacora(cliente, SERVICIO, "Baja de cuenta", `${cuenta.matricula_nomina}: ${datos.motivo.trim()}`, autor.id);
      return { mensaje: "Cuenta dada de baja." };
    });
  }

  // ── Cambio de cuentas (HU4-SP0) ────────────────────────────────────────────
  async actualizar(id: number, cambios: CambiosCuentaDto, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const actual = await consultarUno<{ nombre_rol: RolUsuario; clave: string; estatus: string; nombre: string; correo: string; telefono: string | null }>(`
        SELECT r.nombre_rol, c.matricula_nomina AS clave, c.estatus,
               COALESCE(e.nombre_completo, p.nombre_completo) AS nombre, COALESCE(e.correo_institucional, p.correo_institucional) AS correo,
               COALESCE(e.telefono, p.telefono) AS telefono
        FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol
        LEFT JOIN USUARIOS_ESCOLARES e ON e.id_credencial = c.id_credencial
        LEFT JOIN PERSONAL_BIBLIOTECA p ON p.id_credencial = c.id_credencial
        WHERE c.id_credencial = $1 FOR UPDATE OF c`, [id], cliente);
      if (!actual) throw new NoEncontrado("La cuenta");
      const esPersonal = ES_PERSONAL(actual.nombre_rol);
      if (cambios.rol && !esPersonal) throw new ErrorDeNegocio("El tipo de cuenta de alumnos, profesores y colaboradores lo define la base de datos escolar.", [], ["rol"]);
      const clave = cambios.identificador?.trim();
      if (clave && clave.toLowerCase() !== actual.clave.toLowerCase()) {
        const ocupada = await consultarUno("SELECT 1 FROM CREDENCIALES WHERE LOWER(matricula_nomina) = LOWER($1) AND id_credencial <> $2", [clave, id], cliente);
        if (ocupada) throw new ErrorDeNegocio(`La clave ${clave} ya pertenece a otra cuenta.`, [], ["identificador"]);
      }
      const reactivar = cambios.estatus === "Activa" && actual.estatus !== "Activa";
      await cliente.query(`UPDATE CREDENCIALES SET
          matricula_nomina = COALESCE($2, matricula_nomina),
          contrasena_hash = COALESCE($3, contrasena_hash),
          id_rol = COALESCE((SELECT id_rol FROM ROLES WHERE nombre_rol = $4), id_rol),
          estatus = CASE WHEN $5 THEN 'Activa' ELSE estatus END,
          fecha_baja = CASE WHEN $5 THEN NULL ELSE fecha_baja END,
          motivo_baja = CASE WHEN $5 THEN NULL ELSE motivo_baja END,
          id_credencial_baja = CASE WHEN $5 THEN NULL ELSE id_credencial_baja END,
          intentos_fallidos = CASE WHEN $5 THEN 0 ELSE intentos_fallidos END
        WHERE id_credencial = $1`, [id, clave ?? null, cambios.contrasena ? cifrarContrasena(cambios.contrasena) : null, cambios.rol ?? null, reactivar]);
      const tabla = esPersonal ? "PERSONAL_BIBLIOTECA" : "USUARIOS_ESCOLARES";
      await cliente.query(`UPDATE ${tabla} SET nombre_completo = COALESCE($2, nombre_completo),
          correo_institucional = COALESCE($3, correo_institucional), telefono = COALESCE($4, telefono) WHERE id_credencial = $1`,
        [id, cambios.nombre?.trim() ?? null, cambios.correo?.trim() ?? null, cambios.telefono ?? null]);
      const campos = await registrarCambios(cliente, "Cuenta", id, [
        ["nombre", actual.nombre, cambios.nombre?.trim()], ["matrícula o nómina", actual.clave, clave], ["correo", actual.correo, cambios.correo?.trim()],
        ["teléfono", actual.telefono, cambios.telefono], ["tipo de cuenta", actual.nombre_rol, cambios.rol],
        ["estatus", actual.estatus, reactivar ? "Activa" : undefined], ["contraseña", null, cambios.contrasena ? "(cambiada)" : undefined],
      ], autor.id);
      await registrarEnBitacora(cliente, SERVICIO, "Cuenta actualizada", `credencial ${id}: ${campos.join(", ") || "sin cambios"}`, autor.id);
      return { mensaje: reactivar && campos.length === 1 ? "Cuenta reactivada." : "Datos de la cuenta actualizados.", campos };
    });
  }

  async historial(id: number) {
    return consultar(`SELECT h.campo, h.valor_anterior AS "valorAnterior", h.valor_nuevo AS "valorNuevo", h.fecha, c.matricula_nomina AS autor
      FROM HISTORIAL_CAMBIOS h JOIN CREDENCIALES c ON c.id_credencial = h.id_credencial
      WHERE h.entidad = 'Cuenta' AND h.id_entidad = $1 ORDER BY h.fecha DESC, h.id_cambio DESC`, [id]);
  }

  // ── Mi cuenta: datos, préstamos y multas propios (HU2-SP0 y HU4-SP0) ───────
  async miCuenta(sesion: Sesion) {
    const datos = await consultarUno(`
      SELECT c.matricula_nomina AS identificador, r.nombre_rol AS rol, pf.nombre AS perfil, c.estatus,
             COALESCE(e.nombre_completo, p.nombre_completo) AS nombre, COALESCE(e.correo_institucional, p.correo_institucional) AS correo,
             COALESCE(e.telefono, p.telefono) AS telefono
      FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol
      LEFT JOIN USUARIOS_ESCOLARES e ON e.id_credencial = c.id_credencial
      LEFT JOIN PERSONAL_BIBLIOTECA p ON p.id_credencial = c.id_credencial
      ${JOIN_PERFIL}
      WHERE c.id_credencial = $1`, [sesion.id]);
    if (!datos) throw new NoEncontrado("La cuenta");
    const [prestamos, multas] = await Promise.all([
      consultar(`SELECT l.titulo, e.clave_ejemplar AS ejemplar, p.fecha_prestamo AS "fechaPrestamo", p.fecha_vencimiento AS "fechaVencimiento",
          (p.fecha_vencimiento < CURRENT_DATE) AS vencido
        FROM PRESTAMOS p JOIN EJEMPLARES e ON e.id_ejemplar = p.id_ejemplar JOIN LIBROS l ON l.id_libro = e.id_libro
        WHERE p.id_credencial = $1 AND p.estado = 'Activo' ORDER BY p.fecha_vencimiento`, [sesion.id]),
      consultar(`SELECT m.motivo, m.monto_mxn::float AS "montoMxn", m.fecha_generacion AS fecha FROM MULTAS m
        WHERE m.id_credencial = $1 AND m.estatus = 'Pendiente' ORDER BY m.fecha_generacion`, [sesion.id]),
    ]);
    return { ...datos, prestamos, multas };
  }

  editarMiCuenta(sesion: Sesion): never {
    if (sesion.rol === "Administrador") throw new ErrorDeNegocio("Cambia tus datos desde Gestión de usuarios.");
    throw new HttpException({ error: SOLO_ADMIN_DATOS }, HttpStatus.FORBIDDEN);
  }

  // ── Gestión de perfiles (HU6-SP0) ──────────────────────────────────────────
  async perfiles() {
    return consultar(`
      SELECT pf.id_perfil AS id, pf.nombre, pf.permisos, pf.es_base AS "esBase", pf.fecha,
             (SELECT COUNT(*)::int FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol
               WHERE c.id_perfil = pf.id_perfil OR (c.id_perfil IS NULL AND pf.es_base AND r.nombre_rol = pf.nombre)) AS cuentas
      FROM PERFILES pf ORDER BY pf.es_base DESC, pf.nombre`);
  }

  async crearPerfil(datos: NuevoPerfilDto, autor: Sesion) {
    const nombre = datos.nombre.trim();
    if (!datos.permisos.length) throw new DatosInvalidos("Selecciona al menos un permiso.", [], ["permisos"]);
    return enTransaccion(async (cliente) => {
      const existe = await consultarUno("SELECT 1 FROM PERFILES WHERE LOWER(nombre) = LOWER($1)", [nombre], cliente);
      if (existe) throw new ErrorDeNegocio("Ya existe un perfil con ese nombre.", [], ["nombre"]);
      const fila = await consultarUno<{ id_perfil: number }>("INSERT INTO PERFILES (nombre, permisos) VALUES ($1, $2) RETURNING id_perfil", [nombre, [...new Set(datos.permisos)]], cliente);
      await registrarEnBitacora(cliente, SERVICIO, "Perfil creado", `${nombre}: ${datos.permisos.join(", ")}`, autor.id);
      return { id: fila!.id_perfil, mensaje: `Perfil ${nombre} creado.` };
    });
  }

  async asignarPerfil(datos: AsignarPerfilDto, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const cuenta = await consultarUno<{ id_credencial: number; matricula_nomina: string; estatus: string; perfil: string }>(`
        SELECT c.id_credencial, c.matricula_nomina, c.estatus, pf.nombre AS perfil
        FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol ${JOIN_PERFIL}
        WHERE LOWER(c.matricula_nomina) = LOWER(TRIM($1)) FOR UPDATE OF c`, [datos.identificador], cliente);
      if (!cuenta) throw new ErrorDeNegocio("La cuenta no existe.", [], ["identificador"]);
      if (cuenta.estatus !== "Activa") throw new ErrorDeNegocio("La cuenta está dada de baja: reactívala antes de asignarle un perfil.", [], ["identificador"]);
      const perfil = await consultarUno<{ nombre: string }>("SELECT nombre FROM PERFILES WHERE id_perfil = $1", [datos.idPerfil], cliente);
      if (!perfil) throw new ErrorDeNegocio("El perfil no existe.", [], ["idPerfil"]);
      if (perfil.nombre === cuenta.perfil) throw new ErrorDeNegocio(`La cuenta ${cuenta.matricula_nomina} ya tiene el perfil ${perfil.nombre}.`);
      await cliente.query("UPDATE CREDENCIALES SET id_perfil = $2 WHERE id_credencial = $1", [cuenta.id_credencial, datos.idPerfil]);
      await registrarCambios(cliente, "Cuenta", cuenta.id_credencial, [["perfil", cuenta.perfil, perfil.nombre]], autor.id);
      await registrarEnBitacora(cliente, SERVICIO, "Perfil asignado", `${cuenta.matricula_nomina}: ${cuenta.perfil} → ${perfil.nombre}`, autor.id);
      return { mensaje: "Perfil asignado. Los permisos nuevos aplican desde su siguiente inicio de sesión." };
    });
  }

  async eliminarPerfil(id: number, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const perfil = (await consultar<{ nombre: string; esBase: boolean; cuentas: number }>(`
        SELECT pf.nombre, pf.es_base AS "esBase",
               (SELECT COUNT(*)::int FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol
                 WHERE c.id_perfil = pf.id_perfil OR (c.id_perfil IS NULL AND pf.es_base AND r.nombre_rol = pf.nombre)) AS cuentas
        FROM PERFILES pf WHERE pf.id_perfil = $1 FOR UPDATE OF pf`, [id], cliente))[0];
      if (!perfil) throw new NoEncontrado("El perfil");
      if (perfil.cuentas > 0) throw new ErrorDeNegocio("No se puede eliminar un perfil que tiene cuentas asignadas.", [`${perfil.cuentas} cuenta(s) tienen el perfil ${perfil.nombre}.`]);
      if (perfil.esBase) throw new ErrorDeNegocio("Los perfiles base de cada tipo de cuenta no se eliminan.");
      await cliente.query("DELETE FROM PERFILES WHERE id_perfil = $1", [id]);
      await registrarEnBitacora(cliente, SERVICIO, "Perfil eliminado", perfil.nombre, autor.id);
      return { mensaje: "Perfil eliminado." };
    });
  }

  /**
   * "Ver la base de datos de la escuela y verificar a los usuarios" (Sprint 0).
   * Actualiza nombre, correo, teléfono y estado activo de cada alumno, profesor y
   * colaborador; los que ya no aparecen quedan como inactivos en la escuela.
   */
  async sincronizarConBaseEscolar(autor: Sesion) {
    const escolares = await consultarBaseEscolar();
    return enTransaccion(async (cliente) => {
      let actualizados = 0; let nuevos = 0;
      const contrasenaInicial = cifrarContrasena(process.env.CONTRASENA_INICIAL_ESCOLAR ?? "1234");
      for (const usuario of escolares) {
        const existente = await consultarUno<{ id_credencial: number }>("SELECT id_credencial FROM CREDENCIALES WHERE matricula_nomina = $1", [usuario.identificador], cliente);
        let id = existente?.id_credencial;
        if (!id) {
          id = (await consultarUno<{ id_credencial: number }>("INSERT INTO CREDENCIALES (id_rol, matricula_nomina, contrasena_hash) VALUES ((SELECT id_rol FROM ROLES WHERE nombre_rol = $1), $2, $3) RETURNING id_credencial",
            [usuario.tipo, usuario.identificador, contrasenaInicial], cliente))!.id_credencial;
          nuevos += 1;
        } else actualizados += 1;
        await cliente.query(`INSERT INTO USUARIOS_ESCOLARES (id_credencial, tipo, nombre_completo, correo_institucional, telefono, activo_en_escuela, verificado_en)
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
          ON CONFLICT (id_credencial) DO UPDATE SET tipo = EXCLUDED.tipo, nombre_completo = EXCLUDED.nombre_completo, correo_institucional = EXCLUDED.correo_institucional,
            telefono = EXCLUDED.telefono, activo_en_escuela = EXCLUDED.activo_en_escuela, verificado_en = CURRENT_TIMESTAMP`,
          [id, usuario.tipo, usuario.nombre, usuario.correo, usuario.telefono, usuario.activo]);
      }
      const ausentes = await cliente.query(`UPDATE USUARIOS_ESCOLARES e SET activo_en_escuela = FALSE, verificado_en = CURRENT_TIMESTAMP
        FROM CREDENCIALES c WHERE c.id_credencial = e.id_credencial AND NOT (c.matricula_nomina = ANY($1::text[]))`, [escolares.map((u) => u.identificador)]);
      const resumen = { consultados: escolares.length, actualizados, nuevos, marcadosInactivos: ausentes.rowCount ?? 0 };
      await registrarEnBitacora(cliente, SERVICIO, "Sincronización con base escolar", JSON.stringify(resumen), autor.id);
      return resumen;
    });
  }
}
