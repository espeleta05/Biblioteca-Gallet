import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { Sesion } from "../../comun/auth";
import { consultar, consultarUno, enTransaccion, registrarEnBitacora } from "../../comun/db";
import { normalizarIsbn, validarCambioEstado } from "../../comun/dominio/libros";
import type { EstadoEjemplar } from "../../comun/dominio/politicas";
import { ErrorDeNegocio, NoEncontrado } from "../../comun/nest";
import type { CambioEjemplarDto, CambiosFichaDto, FiltroLibrosDto, NuevaFichaDto, NuevosEjemplaresDto, SolicitudCompraDto, UbicacionDto } from "./dto";

const SERVICIO = "gestionar-libros";

function isbnValido(entrada: string): string {
  const isbn = normalizarIsbn(entrada);
  if (!isbn) throw new ErrorDeNegocio(`El ISBN "${entrada}" no es válido.`, ["Debe tener 10 o 13 dígitos y un dígito verificador correcto."]);
  return isbn;
}

async function idCatalogo(cliente: PoolClient, tabla: "EDITORIALES" | "TEMAS" | "AUTORES", columna: string, nombre: string): Promise<number> {
  const id = tabla === "EDITORIALES" ? "id_editorial" : tabla === "TEMAS" ? "id_tema" : "id_autor";
  const fila = await consultarUno<{ id: number }>(
    `INSERT INTO ${tabla} (${columna}) VALUES ($1) ON CONFLICT (${columna}) DO UPDATE SET ${columna} = EXCLUDED.${columna} RETURNING ${id} AS id`,
    [nombre.trim()], cliente);
  return fila!.id;
}

async function asignarAutores(cliente: PoolClient, idLibro: number, autores: string[]): Promise<void> {
  await cliente.query("DELETE FROM LIBRO_AUTOR WHERE id_libro = $1", [idLibro]);
  for (const autor of new Set(autores.map((a) => a.trim()).filter(Boolean))) {
    await cliente.query("INSERT INTO LIBRO_AUTOR (id_libro, id_autor) VALUES ($1, $2)", [idLibro, await idCatalogo(cliente, "AUTORES", "nombre_autor", autor)]);
  }
}

async function agregarEjemplares(cliente: PoolClient, idLibro: number, isbn: string, cantidad: number, u: UbicacionDto): Promise<void> {
  const { total } = (await consultarUno<{ total: number }>("SELECT COUNT(*)::int AS total FROM EJEMPLARES WHERE id_libro = $1", [idLibro], cliente))!;
  for (let i = 1; i <= cantidad; i += 1) {
    await cliente.query("INSERT INTO EJEMPLARES (id_libro, clave_ejemplar, piso, area, pasillo, estante) VALUES ($1, $2, $3, $4, $5, $6)",
      [idLibro, `${isbn}-${String(total + i).padStart(3, "0")}`, u.piso, u.area, u.pasillo, u.estante]);
  }
}

@Injectable()
export class ServicioLibros {
  /** Listado de libros por diversos filtros, con conteo por estado (inventario). */
  async listar(f: FiltroLibrosDto) {
    return consultar(`
      SELECT l.id_libro AS id, l.isbn, l.titulo, l.tipo_uso AS "tipoUso", l.precio_ultima_compra_usd AS "precioUsd",
             l.edicion, l.anio_publicacion AS "anioPublicacion", l.paginas, ed.nombre_editorial AS editorial, t.nombre_tema AS tema,
             (SELECT string_agg(a.nombre_autor, ', ' ORDER BY a.nombre_autor) FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro) AS autores,
             COUNT(e.id_ejemplar)::int AS total,
             COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Disponible')::int AS disponibles,
             COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Prestado')::int AS prestados,
             COUNT(e.id_ejemplar) FILTER (WHERE e.estado IN ('Perdido','Robado','Dañado'))::int AS "fueraDeServicio"
      FROM LIBROS l
      JOIN EDITORIALES ed ON ed.id_editorial = l.id_editorial
      JOIN TEMAS t ON t.id_tema = l.id_tema
      LEFT JOIN EJEMPLARES e ON e.id_libro = l.id_libro
      WHERE ($1::text IS NULL OR l.titulo ILIKE '%' || $1 || '%' OR l.isbn LIKE $1 || '%'
             OR EXISTS (SELECT 1 FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro AND a.nombre_autor ILIKE '%' || $1 || '%'))
        AND ($2::text IS NULL OR t.nombre_tema = $2)
        AND ($3::text IS NULL OR ed.nombre_editorial = $3)
        AND ($4::text IS NULL OR l.tipo_uso = $4)
        AND ($5::text IS NULL OR EXISTS (SELECT 1 FROM EJEMPLARES x WHERE x.id_libro = l.id_libro AND x.estado = $5))
        AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM EJEMPLARES x WHERE x.id_libro = l.id_libro AND x.piso = $6))
      GROUP BY l.id_libro, ed.nombre_editorial, t.nombre_tema
      ORDER BY l.titulo`, [f.q?.trim() || null, f.tema ?? null, f.editorial ?? null, f.tipoUso ?? null, f.estado ?? null, f.piso ?? null]);
  }

  async ficha(id: number) {
    const [libro] = await consultar<Record<string, unknown>>(`
      SELECT l.id_libro AS id, l.isbn, l.titulo, l.tipo_uso AS "tipoUso", l.precio_ultima_compra_usd AS "precioUsd", l.edicion,
             l.anio_publicacion AS "anioPublicacion", l.paginas, ed.nombre_editorial AS editorial, t.nombre_tema AS tema,
             ARRAY(SELECT a.nombre_autor FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro ORDER BY a.nombre_autor) AS autores
      FROM LIBROS l JOIN EDITORIALES ed ON ed.id_editorial = l.id_editorial JOIN TEMAS t ON t.id_tema = l.id_tema
      WHERE l.id_libro = $1`, [id]);
    if (!libro) throw new NoEncontrado("El libro");
    const ejemplares = await consultar("SELECT id_ejemplar AS id, clave_ejemplar AS clave, estado, piso, area, pasillo, estante FROM EJEMPLARES WHERE id_libro = $1 ORDER BY clave_ejemplar", [id]);
    return { ...libro, ejemplares };
  }

  /** Generación de ficha bibliográfica (incluye precio en dólares para la Regla 4). */
  async crear(datos: NuevaFichaDto, autor: Sesion) {
    const isbn = isbnValido(datos.isbn);
    return enTransaccion(async (cliente) => {
      const libro = await consultarUno<{ id_libro: number }>(`
        INSERT INTO LIBROS (isbn, titulo, id_editorial, id_tema, edicion, anio_publicacion, paginas, tipo_uso, precio_ultima_compra_usd)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id_libro`,
        [isbn, datos.titulo.trim(), await idCatalogo(cliente, "EDITORIALES", "nombre_editorial", datos.editorial), await idCatalogo(cliente, "TEMAS", "nombre_tema", datos.tema),
          datos.edicion ?? null, datos.anioPublicacion ?? null, datos.paginas ?? null, datos.tipoUso, datos.precioUsd], cliente);
      await asignarAutores(cliente, libro!.id_libro, datos.autores);
      await agregarEjemplares(cliente, libro!.id_libro, isbn, datos.ejemplares, datos.ubicacion);
      await registrarEnBitacora(cliente, SERVICIO, "Ficha creada", `${isbn} · ${datos.titulo} · ${datos.ejemplares} ejemplar(es)`, autor.id);
      return { id: libro!.id_libro, isbn };
    });
  }

  async actualizar(id: number, cambios: CambiosFichaDto, autor: Sesion) {
    const isbn = cambios.isbn ? isbnValido(cambios.isbn) : null;
    return enTransaccion(async (cliente) => {
      const existe = await consultarUno("SELECT 1 FROM LIBROS WHERE id_libro = $1 FOR UPDATE", [id], cliente);
      if (!existe) throw new NoEncontrado("El libro");
      await cliente.query(`UPDATE LIBROS SET isbn = COALESCE($2, isbn), titulo = COALESCE($3, titulo),
          id_editorial = COALESCE($4, id_editorial), id_tema = COALESCE($5, id_tema), edicion = COALESCE($6, edicion),
          anio_publicacion = COALESCE($7, anio_publicacion), paginas = COALESCE($8, paginas), tipo_uso = COALESCE($9, tipo_uso),
          precio_ultima_compra_usd = COALESCE($10, precio_ultima_compra_usd) WHERE id_libro = $1`,
        [id, isbn, cambios.titulo?.trim() ?? null,
          cambios.editorial ? await idCatalogo(cliente, "EDITORIALES", "nombre_editorial", cambios.editorial) : null,
          cambios.tema ? await idCatalogo(cliente, "TEMAS", "nombre_tema", cambios.tema) : null,
          cambios.edicion ?? null, cambios.anioPublicacion ?? null, cambios.paginas ?? null, cambios.tipoUso ?? null, cambios.precioUsd ?? null]);
      if (cambios.autores) await asignarAutores(cliente, id, cambios.autores);
      await registrarEnBitacora(cliente, SERVICIO, "Ficha actualizada", `libro ${id}: ${Object.keys(cambios).join(", ")}`, autor.id);
      return { ok: true };
    });
  }

  /** Solo se elimina una ficha sin historial; si tuvo préstamos se conserva como evidencia. */
  async eliminar(id: number, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const libro = await consultarUno<{ titulo: string; con_historial: boolean }>(`
        SELECT titulo, EXISTS (SELECT 1 FROM PRESTAMOS p JOIN EJEMPLARES e ON e.id_ejemplar = p.id_ejemplar WHERE e.id_libro = l.id_libro) AS con_historial
        FROM LIBROS l WHERE id_libro = $1`, [id], cliente);
      if (!libro) throw new NoEncontrado("El libro");
      if (libro.con_historial) {
        throw new ErrorDeNegocio("La ficha tiene préstamos registrados y se conserva como evidencia.", ["Marca sus ejemplares como Perdido, Robado o Dañado para retirarlos de circulación."]);
      }
      await cliente.query("DELETE FROM EJEMPLARES WHERE id_libro = $1", [id]);
      await cliente.query("DELETE FROM LIBROS WHERE id_libro = $1", [id]);
      await registrarEnBitacora(cliente, SERVICIO, "Ficha eliminada", `${id} · ${libro.titulo}`, autor.id);
      return { ok: true };
    });
  }

  async nuevosEjemplares(id: number, datos: NuevosEjemplaresDto, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const libro = await consultarUno<{ isbn: string }>("SELECT isbn FROM LIBROS WHERE id_libro = $1 FOR UPDATE", [id], cliente);
      if (!libro) throw new NoEncontrado("El libro");
      await agregarEjemplares(cliente, id, libro.isbn, datos.cantidad, datos.ubicacion);
      await registrarEnBitacora(cliente, SERVICIO, "Ejemplares agregados", `libro ${id}: ${datos.cantidad}`, autor.id);
      return { ok: true };
    });
  }

  /** Tener el estado del libro (prestado, perdido, etc.) y su ubicación. */
  async cambiarEjemplar(idLibro: number, idEjemplar: number, cambio: CambioEjemplarDto, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const ejemplar = await consultarUno<{ estado: EstadoEjemplar; clave_ejemplar: string }>(
        "SELECT estado, clave_ejemplar FROM EJEMPLARES WHERE id_ejemplar = $1 AND id_libro = $2 FOR UPDATE", [idEjemplar, idLibro], cliente);
      if (!ejemplar) throw new NoEncontrado("El ejemplar");
      if (cambio.estado) {
        const problema = validarCambioEstado(ejemplar.estado, cambio.estado);
        if (problema) throw new ErrorDeNegocio(problema);
      }
      const u = cambio.ubicacion;
      await cliente.query(`UPDATE EJEMPLARES SET estado = COALESCE($2, estado), piso = COALESCE($3, piso), area = COALESCE($4, area),
          pasillo = COALESCE($5, pasillo), estante = COALESCE($6, estante) WHERE id_ejemplar = $1`,
        [idEjemplar, cambio.estado ?? null, u?.piso ?? null, u?.area ?? null, u?.pasillo ?? null, u?.estante ?? null]);
      await registrarEnBitacora(cliente, SERVICIO, "Ejemplar actualizado", `${ejemplar.clave_ejemplar}: ${ejemplar.estado} → ${cambio.estado ?? ejemplar.estado}`, autor.id);
      return { ok: true };
    });
  }

  async catalogos() {
    const [temas, editoriales, pisos] = await Promise.all([
      consultar<{ nombre: string }>("SELECT nombre_tema AS nombre FROM TEMAS ORDER BY 1"),
      consultar<{ nombre: string }>("SELECT nombre_editorial AS nombre FROM EDITORIALES ORDER BY 1"),
      consultar<{ nombre: string }>("SELECT DISTINCT piso AS nombre FROM EJEMPLARES ORDER BY 1"),
    ]);
    return { temas: temas.map((t) => t.nombre), editoriales: editoriales.map((e) => e.nombre), pisos: pisos.map((p) => p.nombre) };
  }

  // Solicitud de compra de libros (solo la solicitud; Propuesta 9.3 excluye el proceso del Comprador).
  async solicitudes() {
    return consultar(`SELECT s.id_solicitud AS id, s.titulo, s.autor, s.isbn, s.cantidad, s.justificacion, s.estatus, s.fecha,
        c.matricula_nomina AS solicitante FROM SOLICITUDES_COMPRA s JOIN CREDENCIALES c ON c.id_credencial = s.id_credencial ORDER BY s.fecha DESC`);
  }

  async solicitarCompra(datos: SolicitudCompraDto, autor: Sesion) {
    const isbn = datos.isbn ? isbnValido(datos.isbn) : null;
    return enTransaccion(async (cliente) => {
      const fila = await consultarUno<{ id_solicitud: number }>(
        "INSERT INTO SOLICITUDES_COMPRA (id_credencial, titulo, autor, isbn, cantidad, justificacion) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_solicitud",
        [autor.id, datos.titulo.trim(), datos.autor.trim(), isbn, datos.cantidad, datos.justificacion.trim()], cliente);
      await registrarEnBitacora(cliente, SERVICIO, "Solicitud de compra", `${datos.cantidad} × ${datos.titulo}`, autor.id);
      return { id: fila!.id_solicitud };
    });
  }

  async decidirSolicitud(id: number, estatus: "Aprobada" | "Rechazada", autor: Sesion) {
    if (autor.rol !== "Administrador") throw new ErrorDeNegocio("Solo el Administrador de biblioteca aprueba o rechaza solicitudes de compra.");
    return enTransaccion(async (cliente) => {
      const r = await cliente.query("UPDATE SOLICITUDES_COMPRA SET estatus = $2 WHERE id_solicitud = $1 AND estatus = 'Pendiente'", [id, estatus]);
      if (!r.rowCount) throw new ErrorDeNegocio("La solicitud no existe o ya fue resuelta.");
      await registrarEnBitacora(cliente, SERVICIO, `Solicitud ${estatus.toLowerCase()}`, `solicitud ${id}`, autor.id);
      return { ok: true };
    });
  }
}
