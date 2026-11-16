import { Injectable } from "@nestjs/common";
import type { Sesion } from "../../comun/auth";
import { enviarYRegistrar } from "../../comun/avisos";
import { consultar, consultarUno, enTransaccion, registrarEnBitacora } from "../../comun/db";
import { hoyEnBiblioteca } from "../../comun/dominio/fechas";
import type { TipoUso } from "../../comun/dominio/politicas";
import { calcularVencimiento, calcularVencimientoRenovado, evaluarPrestamo, evaluarRenovacion } from "../../comun/dominio/prestamos";
import type { Canal } from "../../comun/integraciones";
import { ErrorDeNegocio, NoEncontrado } from "../../comun/nest";
import { situacionSolicitante } from "../../comun/solicitantes";

const SERVICIO = "prestar-libros";
const SOLICITANTES = ["Alumno", "Profesor", "Colaborador"];

export const folioPrestamo = (id: number) => `P-${String(id).padStart(6, "0")}`;

@Injectable()
export class ServicioPrestamos {
  async listar(estado?: string, q?: string) {
    return consultar(`
      SELECT p.id_prestamo AS id, p.fecha_prestamo AS "fechaPrestamo", p.fecha_vencimiento AS vencimiento, p.fecha_devolucion AS "fechaDevolucion",
             p.estado, p.condicion_devolucion AS condicion, (p.estado = 'Activo' AND p.fecha_vencimiento < $3::date) AS vencido,
             (SELECT COUNT(*)::int FROM RENOVACIONES r WHERE r.id_prestamo = p.id_prestamo) AS renovaciones,
             c.id_credencial AS "idSolicitante", c.matricula_nomina AS identificador, ue.nombre_completo AS solicitante, ue.tipo,
             l.id_libro AS "idLibro", l.titulo, l.isbn, e.clave_ejemplar AS ejemplar
      FROM PRESTAMOS p
      JOIN CREDENCIALES c ON c.id_credencial = p.id_credencial
      LEFT JOIN USUARIOS_ESCOLARES ue ON ue.id_credencial = c.id_credencial
      JOIN EJEMPLARES e ON e.id_ejemplar = p.id_ejemplar JOIN LIBROS l ON l.id_libro = e.id_libro
      WHERE ($1::text IS NULL OR p.estado = $1)
        AND ($2::text IS NULL OR CONCAT_WS(' ', c.matricula_nomina, ue.nombre_completo, l.titulo, l.isbn) ILIKE '%' || $2 || '%')
      ORDER BY p.estado, p.fecha_vencimiento, p.id_prestamo DESC LIMIT 300`, [estado ?? null, q?.trim() || null, hoyEnBiblioteca()]);
  }

  /** Búsqueda de solicitantes con su situación, para validar antes de prestar. */
  async buscarSolicitantes(q: string) {
    const candidatos = await consultar<{ id: number }>(`
      SELECT c.id_credencial AS id FROM CREDENCIALES c JOIN USUARIOS_ESCOLARES ue ON ue.id_credencial = c.id_credencial
      WHERE CONCAT_WS(' ', c.matricula_nomina, ue.nombre_completo) ILIKE '%' || $1 || '%' ORDER BY ue.nombre_completo LIMIT 10`, [q.trim()]);
    return Promise.all(candidatos.map(async ({ id }) => situacionSolicitante(id)));
  }

  async buscarLibros(q: string) {
    return consultar(`
      SELECT l.id_libro AS id, l.titulo, l.isbn, l.tipo_uso AS "tipoUso",
             COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Disponible')::int AS disponibles,
             (SELECT COUNT(*)::int FROM LISTA_ESPERA w WHERE w.id_libro = l.id_libro AND w.estado IN ('En espera','Notificado')) AS "enEspera"
      FROM LIBROS l LEFT JOIN EJEMPLARES e ON e.id_libro = l.id_libro
      WHERE l.titulo ILIKE '%' || $1 || '%' OR l.isbn LIKE $1 || '%'
      GROUP BY l.id_libro ORDER BY l.titulo LIMIT 10`, [q.trim()]);
  }

  /** Registro de préstamo: valida solicitante y libro (Regla 1) y fija el vencimiento (Reglas 5 y 6). */
  async prestar(idSolicitante: number, idLibro: number, canal: Canal, autor: Sesion) {
    const hoy = hoyEnBiblioteca();
    const resultado = await enTransaccion(async (cliente) => {
      // Bloquea al solicitante para que dos préstamos simultáneos no superen el máximo.
      await cliente.query("SELECT 1 FROM CREDENCIALES WHERE id_credencial = $1 FOR UPDATE", [idSolicitante]);
      const solicitante = await situacionSolicitante(idSolicitante, cliente);
      if (!solicitante) throw new NoEncontrado("El solicitante");
      if (!SOLICITANTES.includes(solicitante.rol)) throw new ErrorDeNegocio("Solo alumnos, profesores y colaboradores solicitan préstamos.");
      const libro = await consultarUno<{ titulo: string; tipo_uso: TipoUso; disponibles: number }>(`
        SELECT l.titulo, l.tipo_uso, COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Disponible')::int AS disponibles
        FROM LIBROS l LEFT JOIN EJEMPLARES e ON e.id_libro = l.id_libro WHERE l.id_libro = $1 GROUP BY l.id_libro`, [idLibro], cliente);
      if (!libro) throw new NoEncontrado("El libro");

      const decision = evaluarPrestamo(solicitante, { tipoUso: libro.tipo_uso, ejemplaresDisponibles: libro.disponibles }, hoy);
      if (!decision.permitido) throw new ErrorDeNegocio(`No se autoriza el préstamo a ${solicitante.nombre}.`, decision.motivos);

      // Si hay personas en lista de espera, el ejemplar se reserva para la primera.
      const primeraEnEspera = await consultarUno<{ id_credencial: number }>(
        "SELECT id_credencial FROM LISTA_ESPERA WHERE id_libro = $1 AND estado IN ('En espera','Notificado') ORDER BY fecha_solicitud LIMIT 1", [idLibro], cliente);
      if (primeraEnEspera && primeraEnEspera.id_credencial !== idSolicitante && libro.disponibles <= 1) {
        throw new ErrorDeNegocio("El único ejemplar disponible está apartado para la primera persona en la lista de espera.");
      }

      const ejemplar = await consultarUno<{ id_ejemplar: number; clave_ejemplar: string; ubicacion: string }>(`
        SELECT id_ejemplar, clave_ejemplar, CONCAT(piso, ' · ', area, ' · pasillo ', pasillo, ' · estante ', estante) AS ubicacion
        FROM EJEMPLARES WHERE id_libro = $1 AND estado = 'Disponible' ORDER BY id_ejemplar LIMIT 1 FOR UPDATE SKIP LOCKED`, [idLibro], cliente);
      if (!ejemplar) throw new ErrorDeNegocio("El último ejemplar disponible acaba de prestarse en otro mostrador.");

      const vencimiento = calcularVencimiento(hoy, solicitante.politica);
      const prestamo = await consultarUno<{ id_prestamo: number }>(`
        INSERT INTO PRESTAMOS (id_ejemplar, id_credencial, id_credencial_registra, fecha_prestamo, fecha_vencimiento)
        VALUES ($1, $2, $3, $4, $5) RETURNING id_prestamo`, [ejemplar.id_ejemplar, idSolicitante, autor.id, hoy, vencimiento], cliente);
      await cliente.query("UPDATE EJEMPLARES SET estado = 'Prestado' WHERE id_ejemplar = $1", [ejemplar.id_ejemplar]);
      await cliente.query("UPDATE LISTA_ESPERA SET estado = 'Atendido' WHERE id_libro = $1 AND id_credencial = $2 AND estado IN ('En espera','Notificado')", [idLibro, idSolicitante]);

      const folio = folioPrestamo(prestamo!.id_prestamo);
      const contenido = [
        `SIGEB · Biblioteca Universidad Ducky`, `Recibo de préstamo ${folio}`, `Fecha: ${hoy}`,
        `Solicitante: ${solicitante.nombre} (${solicitante.identificador}, ${solicitante.rol})`,
        `Libro: ${libro.titulo}`, `Ejemplar: ${ejemplar.clave_ejemplar}`,
        `Fecha de vencimiento: ${vencimiento} (${solicitante.politica.diasHabiles} días hábiles)`,
        `Renovaciones permitidas: ${solicitante.politica.maxRenovaciones}. Multa por retraso: $10 por día.`,
      ].join("\n");
      await cliente.query("INSERT INTO RECIBOS (folio, tipo, id_referencia, id_credencial, contenido) VALUES ($1, 'Préstamo', $2, $3, $4)", [folio, prestamo!.id_prestamo, idSolicitante, contenido]);
      await registrarEnBitacora(cliente, SERVICIO, "Préstamo registrado", `${folio} · ${solicitante.identificador} · ${ejemplar.clave_ejemplar} · vence ${vencimiento}`, autor.id);
      return { id: prestamo!.id_prestamo, folio, vencimiento, ejemplar: ejemplar.clave_ejemplar, ubicacion: ejemplar.ubicacion, contenido };
    });
    const envio = await enviarYRegistrar({ idCredencial: idSolicitante, tipo: "Recibo de préstamo", canal, asunto: `Recibo de préstamo ${resultado.folio}`, mensaje: resultado.contenido });
    return { ...resultado, envio };
  }

  /** Renovación de préstamo (Reglas 2 y 6). */
  async renovar(idPrestamo: number, autor: Sesion) {
    const hoy = hoyEnBiblioteca();
    return enTransaccion(async (cliente) => {
      const prestamo = await consultarUno<{ estado: "Activo" | "Devuelto"; fecha_vencimiento: string; id_credencial: number; renovaciones: number }>(`
        SELECT p.estado, p.fecha_vencimiento, p.id_credencial, (SELECT COUNT(*)::int FROM RENOVACIONES r WHERE r.id_prestamo = p.id_prestamo) AS renovaciones
        FROM PRESTAMOS p WHERE p.id_prestamo = $1 FOR UPDATE`, [idPrestamo], cliente);
      if (!prestamo) throw new NoEncontrado("El préstamo");
      const solicitante = await situacionSolicitante(prestamo.id_credencial, cliente);
      const decision = evaluarRenovacion({ estado: prestamo.estado, vencimiento: prestamo.fecha_vencimiento, renovacionesRealizadas: prestamo.renovaciones }, solicitante!.politica, hoy);
      if (!decision.permitido) throw new ErrorDeNegocio("No se autoriza la renovación.", decision.motivos);
      const nuevoVencimiento = calcularVencimientoRenovado(prestamo.fecha_vencimiento, solicitante!.politica);
      await cliente.query("INSERT INTO RENOVACIONES (id_prestamo, id_credencial_autoriza, fecha_vencimiento_anterior, fecha_vencimiento_nueva) VALUES ($1, $2, $3, $4)",
        [idPrestamo, autor.id, prestamo.fecha_vencimiento, nuevoVencimiento]);
      await cliente.query("UPDATE PRESTAMOS SET fecha_vencimiento = $2 WHERE id_prestamo = $1", [idPrestamo, nuevoVencimiento]);
      await registrarEnBitacora(cliente, SERVICIO, "Renovación", `${folioPrestamo(idPrestamo)}: ${prestamo.fecha_vencimiento} → ${nuevoVencimiento} (${prestamo.renovaciones + 1}/${solicitante!.politica.maxRenovaciones})`, autor.id);
      return { vencimiento: nuevoVencimiento, renovacion: prestamo.renovaciones + 1, maximo: solicitante!.politica.maxRenovaciones };
    });
  }

  async recibo(folio: string) {
    const recibo = await consultarUno("SELECT folio, tipo, contenido, fecha, id_credencial AS \"idCredencial\" FROM RECIBOS WHERE folio = $1", [folio]);
    if (!recibo) throw new NoEncontrado(`El recibo ${folio}`);
    const envios = await consultar("SELECT canal, destino, estado, detalle_envio AS detalle, fecha FROM AVISOS WHERE id_credencial = $1 AND mensaje = $2 ORDER BY fecha", [(recibo as { idCredencial: number }).idCredencial, (recibo as { contenido: string }).contenido]);
    return { ...recibo, envios };
  }

  async reenviarRecibo(folio: string, canal: Canal) {
    const recibo = await consultarUno<{ tipo: "Préstamo" | "Pago"; contenido: string; id_credencial: number }>("SELECT tipo, contenido, id_credencial FROM RECIBOS WHERE folio = $1", [folio]);
    if (!recibo) throw new NoEncontrado(`El recibo ${folio}`);
    return enviarYRegistrar({ idCredencial: recibo.id_credencial, tipo: recibo.tipo === "Préstamo" ? "Recibo de préstamo" : "Recibo de pago", canal, asunto: `Recibo ${folio}`, mensaje: recibo.contenido });
  }

  // --- Gestión y registro de lista de espera ---------------------------------

  async listaEspera(idLibro?: number) {
    return consultar(`
      SELECT w.id_espera AS id, w.estado, w.fecha_solicitud AS "fechaSolicitud", w.fecha_notificacion AS "fechaNotificacion",
             l.id_libro AS "idLibro", l.titulo, c.matricula_nomina AS identificador, ue.nombre_completo AS solicitante,
             ROW_NUMBER() OVER (PARTITION BY w.id_libro ORDER BY w.fecha_solicitud)::int AS turno
      FROM LISTA_ESPERA w JOIN LIBROS l ON l.id_libro = w.id_libro
      JOIN CREDENCIALES c ON c.id_credencial = w.id_credencial LEFT JOIN USUARIOS_ESCOLARES ue ON ue.id_credencial = c.id_credencial
      WHERE w.estado IN ('En espera','Notificado') AND ($1::int IS NULL OR w.id_libro = $1)
      ORDER BY l.titulo, w.fecha_solicitud`, [idLibro ?? null]);
  }

  async registrarEspera(idSolicitante: number, idLibro: number, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const libro = await consultarUno<{ titulo: string; disponibles: number; tipo_uso: TipoUso }>(`
        SELECT l.titulo, l.tipo_uso, COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Disponible')::int AS disponibles
        FROM LIBROS l LEFT JOIN EJEMPLARES e ON e.id_libro = l.id_libro WHERE l.id_libro = $1 GROUP BY l.id_libro`, [idLibro], cliente);
      if (!libro) throw new NoEncontrado("El libro");
      if (libro.tipo_uso !== "Préstamo externo") throw new ErrorDeNegocio(`"${libro.titulo}" es de ${libro.tipo_uso.toLowerCase()} y no se presta.`);
      if (libro.disponibles > 0) throw new ErrorDeNegocio(`Hay ${libro.disponibles} ejemplar(es) disponible(s): registra el préstamo en lugar de la lista de espera.`);
      const solicitante = await situacionSolicitante(idSolicitante, cliente);
      if (!solicitante || !SOLICITANTES.includes(solicitante.rol)) throw new ErrorDeNegocio("Solo alumnos, profesores y colaboradores pueden estar en lista de espera.");
      try {
        const fila = await consultarUno<{ id_espera: number }>("INSERT INTO LISTA_ESPERA (id_libro, id_credencial) VALUES ($1, $2) RETURNING id_espera", [idLibro, idSolicitante], cliente);
        await registrarEnBitacora(cliente, SERVICIO, "Lista de espera", `${solicitante.identificador} espera "${libro.titulo}"`, autor.id);
        return { id: fila!.id_espera };
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new ErrorDeNegocio(`${solicitante.nombre} ya está en la lista de espera de este libro.`);
        throw error;
      }
    });
  }

  async cancelarEspera(id: number, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const r = await cliente.query("UPDATE LISTA_ESPERA SET estado = 'Cancelado' WHERE id_espera = $1 AND estado IN ('En espera','Notificado')", [id]);
      if (!r.rowCount) throw new ErrorDeNegocio("La solicitud de espera no existe o ya fue atendida.");
      await registrarEnBitacora(cliente, SERVICIO, "Espera cancelada", `espera ${id}`, autor.id);
      return { ok: true };
    });
  }

  /** Al devolverse un ejemplar se avisa a la primera persona en espera (llamada interna de Devolver libros). */
  async avisarPrimeroEnEspera(idLibro: number) {
    const siguiente = await consultarUno<{ id_espera: number; id_credencial: number; titulo: string }>(`
      SELECT w.id_espera, w.id_credencial, l.titulo FROM LISTA_ESPERA w JOIN LIBROS l ON l.id_libro = w.id_libro
      WHERE w.id_libro = $1 AND w.estado = 'En espera' ORDER BY w.fecha_solicitud LIMIT 1`, [idLibro]);
    if (!siguiente) return { avisado: false };
    await enTransaccion(async (cliente) => {
      await cliente.query("UPDATE LISTA_ESPERA SET estado = 'Notificado', fecha_notificacion = CURRENT_TIMESTAMP WHERE id_espera = $1", [siguiente.id_espera]);
      await registrarEnBitacora(cliente, SERVICIO, "Aviso de lista de espera", `espera ${siguiente.id_espera}`);
    });
    const envio = await enviarYRegistrar({ idCredencial: siguiente.id_credencial, tipo: "Lista de espera", canal: "Correo", asunto: "Tu libro ya está disponible",
      mensaje: `El libro "${siguiente.titulo}" que solicitaste ya está disponible. Acude al mostrador de la biblioteca para recogerlo.` });
    return { avisado: true, envio };
  }
}
