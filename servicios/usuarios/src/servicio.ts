import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { firmarToken, type Sesion } from "../../comun/auth";
import { config } from "../../comun/config";
import { cifrarContrasena, verificarContrasena } from "../../comun/contrasenas";
import { consultar, consultarUno, enTransaccion, obtenerPool, registrarEnBitacora } from "../../comun/db";
import type { RolUsuario } from "../../comun/dominio/politicas";
import { consultarBaseEscolar } from "../../comun/integraciones";
import { ErrorDeNegocio, NoEncontrado } from "../../comun/nest";
import type { CambiosUsuarioDto, FiltroUsuariosDto, NuevoPersonalDto } from "./dto";

type FilaCredencial = {
  id_credencial: number; matricula_nomina: string; contrasena_hash: string; estatus: string;
  intentos_fallidos: number; bloqueado_hasta: Date | null; nombre_rol: RolUsuario; nombre: string | null; activo_en_escuela: boolean | null;
};

@Injectable()
export class ServicioUsuarios {
  async iniciarSesion(identificador: string, contrasena: string): Promise<{ sesion: Sesion; token: string }> {
    const usuario = await consultarUno<FilaCredencial>(`
      SELECT c.id_credencial, c.matricula_nomina, c.contrasena_hash, c.estatus, c.intentos_fallidos, c.bloqueado_hasta,
             r.nombre_rol, COALESCE(e.nombre_completo, p.nombre_completo) AS nombre, e.activo_en_escuela
      FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol
      LEFT JOIN USUARIOS_ESCOLARES e ON e.id_credencial = c.id_credencial
      LEFT JOIN PERSONAL_BIBLIOTECA p ON p.id_credencial = c.id_credencial
      WHERE LOWER(c.matricula_nomina) = LOWER(TRIM($1))`, [identificador]);

    const credencialesInvalidas = new HttpException({ error: "Usuario o contraseña incorrectos." }, HttpStatus.UNAUTHORIZED);
    if (!usuario) throw credencialesInvalidas;
    if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > new Date()) {
      throw new HttpException({ error: `Cuenta bloqueada por ${config.intentosMaximos} intentos fallidos. Intenta de nuevo después de las ${usuario.bloqueado_hasta.toLocaleTimeString("es-MX", { timeZone: "America/Monterrey" })}.` }, HttpStatus.LOCKED);
    }
    if (!verificarContrasena(contrasena, usuario.contrasena_hash)) {
      const intentos = usuario.intentos_fallidos + 1;
      if (intentos >= config.intentosMaximos) {
        await obtenerPool().query(`UPDATE CREDENCIALES SET intentos_fallidos = 0, bloqueado_hasta = CURRENT_TIMESTAMP + make_interval(mins => $2) WHERE id_credencial = $1`, [usuario.id_credencial, config.minutosBloqueo]);
        await registrarEnBitacora(obtenerPool(), "usuarios", "Cuenta bloqueada", `${usuario.matricula_nomina}: ${intentos} intentos fallidos`, usuario.id_credencial);
        throw new HttpException({ error: `Cuenta bloqueada ${config.minutosBloqueo} minutos por ${config.intentosMaximos} intentos fallidos.` }, HttpStatus.LOCKED);
      }
      await obtenerPool().query("UPDATE CREDENCIALES SET intentos_fallidos = $2 WHERE id_credencial = $1", [usuario.id_credencial, intentos]);
      throw credencialesInvalidas;
    }
    if (usuario.estatus !== "Activa") throw new HttpException({ error: "La cuenta está desactivada. Acude con el administrador de la biblioteca." }, HttpStatus.FORBIDDEN);
    if (usuario.activo_en_escuela === false) throw new HttpException({ error: "La base de datos escolar indica que ya no estás activo en la Universidad." }, HttpStatus.FORBIDDEN);

    await obtenerPool().query("UPDATE CREDENCIALES SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_credencial = $1", [usuario.id_credencial]);
    const sesion: Sesion = { id: usuario.id_credencial, identificador: usuario.matricula_nomina, nombre: usuario.nombre ?? usuario.matricula_nomina, rol: usuario.nombre_rol };
    return { sesion, token: await firmarToken(sesion) };
  }

  async listar(filtro: FiltroUsuariosDto) {
    return consultar(`
      SELECT c.id_credencial AS id, c.matricula_nomina AS identificador, r.nombre_rol AS rol, c.estatus,
             COALESCE(e.nombre_completo, p.nombre_completo) AS nombre,
             COALESCE(e.correo_institucional, p.correo_institucional) AS correo,
             COALESCE(e.telefono, p.telefono) AS telefono,
             e.activo_en_escuela AS "activoEnEscuela", e.verificado_en AS "verificadoEn",
             EXISTS (SELECT 1 FROM SUSPENSIONES s WHERE s.id_credencial = c.id_credencial AND s.estado = 'Activa') AS suspendido
      FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol
      LEFT JOIN USUARIOS_ESCOLARES e ON e.id_credencial = c.id_credencial
      LEFT JOIN PERSONAL_BIBLIOTECA p ON p.id_credencial = c.id_credencial
      WHERE ($1::text IS NULL OR r.nombre_rol = $1)
        AND ($2::text IS NULL OR CONCAT_WS(' ', c.matricula_nomina, e.nombre_completo, p.nombre_completo, e.correo_institucional, p.correo_institucional) ILIKE '%' || $2 || '%')
      ORDER BY r.id_rol, nombre`, [filtro.rol ?? null, filtro.q?.trim() || null]);
  }

  async crearPersonal(datos: NuevoPersonalDto, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const credencial = await consultarUno<{ id_credencial: number }>(`
        INSERT INTO CREDENCIALES (id_rol, matricula_nomina, contrasena_hash)
        VALUES ((SELECT id_rol FROM ROLES WHERE nombre_rol = $1), $2, $3) RETURNING id_credencial`,
        [datos.rol, datos.identificador.trim(), cifrarContrasena(datos.contrasena)], cliente);
      await cliente.query("INSERT INTO PERSONAL_BIBLIOTECA (id_credencial, nombre_completo, correo_institucional, telefono) VALUES ($1, $2, $3, $4)",
        [credencial!.id_credencial, datos.nombre.trim(), datos.correo.trim(), datos.telefono ?? null]);
      await registrarEnBitacora(cliente, "usuarios", "Alta de personal", `${datos.rol} ${datos.identificador}`, autor.id);
      return { id: credencial!.id_credencial };
    });
  }

  async actualizar(id: number, cambios: CambiosUsuarioDto, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const actual = await consultarUno<{ nombre_rol: RolUsuario }>("SELECT r.nombre_rol FROM CREDENCIALES c JOIN ROLES r ON r.id_rol = c.id_rol WHERE c.id_credencial = $1 FOR UPDATE OF c", [id], cliente);
      if (!actual) throw new NoEncontrado("El usuario");
      const esPersonal = actual.nombre_rol === "Administrador" || actual.nombre_rol === "Bibliotecario";
      if (!esPersonal && (cambios.nombre || cambios.correo || cambios.telefono || cambios.rol)) {
        throw new ErrorDeNegocio("Los datos de alumnos, profesores y colaboradores vienen de la base de datos escolar y no se editan en SIGEB.", ["Solo se puede activar o desactivar su cuenta."]);
      }
      if (cambios.estatus === "Inactiva" && id === autor.id) throw new ErrorDeNegocio("No puedes desactivar tu propia cuenta.");
      await cliente.query(`UPDATE CREDENCIALES SET
          estatus = COALESCE($2, estatus),
          contrasena_hash = COALESCE($3, contrasena_hash),
          id_rol = COALESCE((SELECT id_rol FROM ROLES WHERE nombre_rol = $4), id_rol)
        WHERE id_credencial = $1`, [id, cambios.estatus ?? null, cambios.contrasena ? cifrarContrasena(cambios.contrasena) : null, cambios.rol ?? null]);
      if (esPersonal) {
        await cliente.query(`UPDATE PERSONAL_BIBLIOTECA SET nombre_completo = COALESCE($2, nombre_completo),
            correo_institucional = COALESCE($3, correo_institucional), telefono = COALESCE($4, telefono) WHERE id_credencial = $1`,
          [id, cambios.nombre ?? null, cambios.correo ?? null, cambios.telefono ?? null]);
      }
      await registrarEnBitacora(cliente, "usuarios", "Usuario actualizado", `credencial ${id}: ${Object.keys(cambios).filter((k) => k !== "contrasena").join(", ") || "contraseña"}`, autor.id);
      return { ok: true };
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
      await registrarEnBitacora(cliente, "usuarios", "Sincronización con base escolar", JSON.stringify(resumen), autor.id);
      return resumen;
    });
  }
}
