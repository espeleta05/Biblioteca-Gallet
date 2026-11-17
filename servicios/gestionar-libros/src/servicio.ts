import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { permisosDe, type Sesion } from "../../comun/auth";
import { formatoPesos } from "../../comun/avisos";
import { consultar, consultarUno, enTransaccion, type Ejecutor, obtenerPool, registrarCambios, registrarEnBitacora } from "../../comun/db";
import { claveLibro, estadoRecepcion, excesoPresupuesto, idDeClaveLibro, normalizarIsbn, precioUsdDeCompra, validarBajaEjemplar, validarCambioEstado } from "../../comun/dominio/libros";
import type { EstadoEjemplar } from "../../comun/dominio/politicas";
import { DatosInvalidos, ErrorDeNegocio, NoEncontrado } from "../../comun/nest";
import type {
  BajaEjemplarDto, CambioEjemplarDto, CambiosFichaDto, FiltroInventarioDto, FiltroLibrosDto, NuevaFichaDto, NuevaUbicacionDto,
  NuevosEjemplaresDto, OrdenCompraDto, RecepcionDto, SolicitudCompraDto, UbicacionDto,
} from "./dto";

const SERVICIO = "gestionar-libros";
const ACTIVO = "e.estado <> 'Dado de baja'";

function isbnValido(entrada: string, campo = "isbn"): string {
  const isbn = normalizarIsbn(entrada);
  if (!isbn) throw new DatosInvalidos(`El ISBN "${entrada}" no es válido.`, ["Debe tener 10 o 13 dígitos y un dígito verificador correcto."], [campo]);
  return isbn;
}

const textoUbicacion = (u: { piso: string | null; area: string | null; pasillo: string | null; estante: string | null }) =>
  u.piso ? `${u.piso}-${u.area}-${u.pasillo}-${u.estante}` : "sin ubicación";

/** HU1-SP1, escenario 4: la ubicación debe existir en la Biblioteca. */
async function validarUbicacion(ejecutor: Ejecutor, u: UbicacionDto): Promise<void> {
  const existe = await consultarUno("SELECT 1 FROM UBICACIONES WHERE piso = $1 AND area = $2 AND pasillo = $3 AND estante = $4",
    [u.piso.trim(), u.area.trim(), u.pasillo.trim(), u.estante.trim()], ejecutor);
  if (!existe) throw new DatosInvalidos(`La ubicación ${textoUbicacion(u)} no existe en la Biblioteca.`, [], ["piso", "area", "pasillo", "estante"]);
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

async function agregarEjemplares(cliente: PoolClient, idLibro: number, isbn: string, cantidad: number, u: UbicacionDto): Promise<string[]> {
  const { total } = (await consultarUno<{ total: number }>("SELECT COUNT(*)::int AS total FROM EJEMPLARES WHERE id_libro = $1", [idLibro], cliente))!;
  const claves: string[] = [];
  for (let i = 1; i <= cantidad; i += 1) {
    const clave = `${isbn}-${String(total + i).padStart(3, "0")}`;
    await cliente.query("INSERT INTO EJEMPLARES (id_libro, clave_ejemplar, piso, area, pasillo, estante) VALUES ($1, $2, $3, $4, $5, $6)",
      [idLibro, clave, u.piso.trim(), u.area.trim(), u.pasillo.trim(), u.estante.trim()]);
    claves.push(clave);
  }
  return claves;
}

/** Libro dueño de un ISBN, para los mensajes de duplicado (HU1-SP1 y HU3-SP1). */
async function libroConIsbn(ejecutor: Ejecutor, isbn: string, excepto?: number) {
  return consultarUno<{ id_libro: number }>("SELECT id_libro FROM LIBROS WHERE isbn = $1 AND ($2::int IS NULL OR id_libro <> $2)", [isbn, excepto ?? null], ejecutor);
}

/** Valores actuales de la ficha, para el historial de cambios. */
async function fichaActual(cliente: PoolClient, id: number) {
  return consultarUno<Record<string, string | number | null>>(`
    SELECT l.isbn, l.titulo, ed.nombre_editorial AS editorial, t.nombre_tema AS tema, l.edicion, l.anio_publicacion, l.paginas, l.tipo_uso,
           l.precio_ultima_compra_usd::float AS precio,
           (SELECT string_agg(a.nombre_autor, '; ' ORDER BY a.nombre_autor) FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro) AS autores
    FROM LIBROS l JOIN EDITORIALES ed ON ed.id_editorial = l.id_editorial JOIN TEMAS t ON t.id_tema = l.id_tema
    WHERE l.id_libro = $1 FOR UPDATE OF l`, [id], cliente);
}

@Injectable()
export class ServicioLibros {
  /** Listado de fichas por diversos filtros, con conteo por estado (gestión del catálogo). */
  async listar(f: FiltroLibrosDto) {
    return consultar(`
      SELECT l.id_libro AS id, 'LIB-' || LPAD(l.id_libro::text, 4, '0') AS clave, l.isbn, l.titulo, l.tipo_uso AS "tipoUso", l.precio_ultima_compra_usd AS "precioUsd",
             l.edicion, l.anio_publicacion AS "anioPublicacion", l.paginas, ed.nombre_editorial AS editorial, t.nombre_tema AS tema,
             (SELECT string_agg(a.nombre_autor, ', ' ORDER BY a.nombre_autor) FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro) AS autores,
             COUNT(e.id_ejemplar) FILTER (WHERE ${ACTIVO})::int AS total,
             COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Disponible')::int AS disponibles,
             COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Prestado')::int AS prestados,
             COUNT(e.id_ejemplar) FILTER (WHERE e.estado IN ('Perdido','Robado','Dañado'))::int AS "fueraDeServicio",
             COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Dado de baja')::int AS "dadosDeBaja"
      FROM LIBROS l
      JOIN EDITORIALES ed ON ed.id_editorial = l.id_editorial
      JOIN TEMAS t ON t.id_tema = l.id_tema
      LEFT JOIN EJEMPLARES e ON e.id_libro = l.id_libro
      WHERE ($1::text IS NULL OR l.titulo ILIKE '%' || $1 || '%' OR l.isbn LIKE $1 || '%' OR 'LIB-' || LPAD(l.id_libro::text, 4, '0') ILIKE $1
             OR EXISTS (SELECT 1 FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro AND a.nombre_autor ILIKE '%' || $1 || '%'))
        AND ($2::text IS NULL OR t.nombre_tema = $2)
        AND ($3::text IS NULL OR ed.nombre_editorial = $3)
        AND ($4::text IS NULL OR l.tipo_uso = $4)
        AND ($5::text IS NULL OR EXISTS (SELECT 1 FROM EJEMPLARES x WHERE x.id_libro = l.id_libro AND x.estado = $5))
        AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM EJEMPLARES x WHERE x.id_libro = l.id_libro AND x.piso = $6))
      GROUP BY l.id_libro, ed.nombre_editorial, t.nombre_tema
      ORDER BY l.titulo`, [f.q?.trim() || null, f.tema ?? null, f.editorial ?? null, f.tipoUso ?? null, f.estado ?? null, f.piso ?? null]);
  }

  /**
   * Ficha completa con el estado de cada ejemplar (HU4-SP1). Un ejemplar
   * disponible apartado para la primera persona notificada de la lista de espera
   * se muestra como "Reservado".
   */
  async ficha(id: number) {
    const libro = await consultarUno<Record<string, unknown>>(`
      SELECT l.id_libro AS id, 'LIB-' || LPAD(l.id_libro::text, 4, '0') AS clave, l.isbn, l.titulo, l.tipo_uso AS "tipoUso", l.precio_ultima_compra_usd AS "precioUsd", l.edicion,
             l.anio_publicacion AS "anioPublicacion", l.paginas, ed.nombre_editorial AS editorial, t.nombre_tema AS tema,
             ARRAY(SELECT a.nombre_autor FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro ORDER BY a.nombre_autor) AS autores,
             (SELECT MIN(p.fecha_vencimiento) FROM PRESTAMOS p JOIN EJEMPLARES x ON x.id_ejemplar = p.id_ejemplar WHERE x.id_libro = l.id_libro AND p.estado = 'Activo') AS "proximaDevolucion"
      FROM LIBROS l JOIN EDITORIALES ed ON ed.id_editorial = l.id_editorial JOIN TEMAS t ON t.id_tema = l.id_tema
      WHERE l.id_libro = $1`, [id]);
    if (!libro) throw new NoEncontrado("El libro");
    const ejemplares = await consultar<{ id: number; clave: string; estado: string; reservado: boolean }>(`
      WITH apartados AS (SELECT COUNT(*)::int AS n FROM LISTA_ESPERA WHERE id_libro = $1 AND estado = 'Notificado')
      SELECT e.id_ejemplar AS id, e.clave_ejemplar AS clave, e.estado, e.piso, e.area, e.pasillo, e.estante, e.motivo_baja AS "motivoBaja", e.fecha_baja AS "fechaBaja",
             (e.estado = 'Disponible' AND ROW_NUMBER() OVER (PARTITION BY e.estado ORDER BY e.clave_ejemplar) <= (SELECT n FROM apartados)) AS reservado
      FROM EJEMPLARES e WHERE e.id_libro = $1 ORDER BY e.clave_ejemplar`, [id]);
    const conEstado = ejemplares.map((e) => ({ ...e, estado: e.reservado ? "Reservado" : e.estado }));
    const disponibles = conEstado.filter((e) => e.estado === "Disponible").length;
    return { ...libro, ejemplares: conEstado, disponibles, sinCopias: disponibles === 0 };
  }

  /** Consulta de libros por clave o ISBN (HU4-SP1). */
  async consultarPorDato(dato: string | undefined) {
    const texto = dato?.trim() ?? "";
    if (!texto) throw new DatosInvalidos("Captura la clave o el ISBN del libro.", [], ["dato"]);
    const id = idDeClaveLibro(texto);
    const isbn = normalizarIsbn(texto) ?? texto.replace(/[-\s]/g, "");
    const fila = await consultarUno<{ id_libro: number }>("SELECT id_libro FROM LIBROS WHERE id_libro = $1 OR isbn = $2", [id ?? -1, isbn]);
    if (!fila) throw new HttpException({ error: `No existe ningún libro con la clave o ISBN ${texto}.` }, HttpStatus.NOT_FOUND);
    return this.ficha(fila.id_libro);
  }

  /** Alta de libros (HU1-SP1): ficha, clave del libro y una clave por ejemplar. */
  async crear(datos: NuevaFichaDto, autor: Sesion) {
    const isbn = isbnValido(datos.isbn);
    return enTransaccion(async (cliente) => {
      const existente = await libroConIsbn(cliente, isbn);
      if (existente) throw new ErrorDeNegocio(`El libro ya existe con clave ${claveLibro(existente.id_libro)}. Para agregar ejemplares usa la opción Cambio de libros.`, [], ["isbn"]);
      await validarUbicacion(cliente, datos.ubicacion);
      const libro = await consultarUno<{ id_libro: number }>(`
        INSERT INTO LIBROS (isbn, titulo, id_editorial, id_tema, edicion, anio_publicacion, paginas, tipo_uso, precio_ultima_compra_usd)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id_libro`,
        [isbn, datos.titulo.trim(), await idCatalogo(cliente, "EDITORIALES", "nombre_editorial", datos.editorial), await idCatalogo(cliente, "TEMAS", "nombre_tema", datos.tema),
          datos.edicion ?? null, datos.anioPublicacion ?? null, datos.paginas ?? null, datos.tipoUso, datos.precioUsd], cliente);
      const id = libro!.id_libro;
      await asignarAutores(cliente, id, datos.autores);
      const claves = await agregarEjemplares(cliente, id, isbn, datos.ejemplares, datos.ubicacion);
      // Si era un libro comprado pendiente de dar de alta, el aviso queda atendido.
      await cliente.query("UPDATE AVISOS_PERSONAL SET atendido = TRUE WHERE tipo = 'Libro por dar de alta' AND isbn = $1", [isbn]);
      await registrarEnBitacora(cliente, SERVICIO, "Alta de libro", `${claveLibro(id)} · ${isbn} · ${datos.titulo} · ${datos.ejemplares} ejemplar(es)`, autor.id);
      return { id, clave: claveLibro(id), isbn, ejemplares: claves, mensaje: `Libro registrado con clave ${claveLibro(id)}.` };
    });
  }

  /** Cambio de libros (HU3-SP1): guarda el dato anterior, la fecha y quién lo cambió. */
  async actualizar(id: number, cambios: CambiosFichaDto, autor: Sesion) {
    const isbn = cambios.isbn ? isbnValido(cambios.isbn) : undefined;
    return enTransaccion(async (cliente) => {
      const antes = await fichaActual(cliente, id);
      if (!antes) throw new NoEncontrado("El libro");
      if (isbn) {
        const otro = await libroConIsbn(cliente, isbn, id);
        if (otro) throw new ErrorDeNegocio(`El ISBN ya pertenece al libro con clave ${claveLibro(otro.id_libro)}.`, [], ["isbn"]);
      }
      await cliente.query(`UPDATE LIBROS SET isbn = COALESCE($2, isbn), titulo = COALESCE($3, titulo),
          id_editorial = COALESCE($4, id_editorial), id_tema = COALESCE($5, id_tema), edicion = COALESCE($6, edicion),
          anio_publicacion = COALESCE($7, anio_publicacion), paginas = COALESCE($8, paginas), tipo_uso = COALESCE($9, tipo_uso),
          precio_ultima_compra_usd = COALESCE($10, precio_ultima_compra_usd) WHERE id_libro = $1`,
        [id, isbn ?? null, cambios.titulo?.trim() ?? null,
          cambios.editorial ? await idCatalogo(cliente, "EDITORIALES", "nombre_editorial", cambios.editorial) : null,
          cambios.tema ? await idCatalogo(cliente, "TEMAS", "nombre_tema", cambios.tema) : null,
          cambios.edicion ?? null, cambios.anioPublicacion ?? null, cambios.paginas ?? null, cambios.tipoUso ?? null, cambios.precioUsd ?? null]);
      if (cambios.autores) await asignarAutores(cliente, id, cambios.autores);
      const campos = await registrarCambios(cliente, "Libro", id, [
        ["ISBN", antes.isbn, isbn], ["título", antes.titulo, cambios.titulo?.trim()], ["autores", antes.autores, cambios.autores?.map((a) => a.trim()).filter(Boolean).sort().join("; ")],
        ["editorial", antes.editorial, cambios.editorial?.trim()], ["tema", antes.tema, cambios.tema?.trim()], ["edición", antes.edicion, cambios.edicion],
        ["año", antes.anio_publicacion, cambios.anioPublicacion], ["páginas", antes.paginas, cambios.paginas], ["tipo de uso", antes.tipo_uso, cambios.tipoUso],
        ["precio USD", antes.precio, cambios.precioUsd],
      ], autor.id);
      await registrarEnBitacora(cliente, SERVICIO, "Libro actualizado", `${claveLibro(id)}: ${campos.join(", ") || "sin cambios"}`, autor.id);
      return { mensaje: "Libro actualizado.", campos };
    });
  }

  /** HU3-SP1, escenario 2: el libro se movió; cambian todos sus ejemplares activos. */
  async cambiarUbicacion(id: number, u: UbicacionDto, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const antes = await consultar<{ texto: string }>(`SELECT DISTINCT COALESCE(piso || '-' || area || '-' || pasillo || '-' || estante, 'sin ubicación') AS texto
        FROM EJEMPLARES e WHERE e.id_libro = $1 AND ${ACTIVO}`, [id], cliente);
      const libro = await consultarUno("SELECT 1 FROM LIBROS WHERE id_libro = $1 FOR UPDATE", [id], cliente);
      if (!libro) throw new NoEncontrado("El libro");
      await validarUbicacion(cliente, u);
      await cliente.query(`UPDATE EJEMPLARES e SET piso = $2, area = $3, pasillo = $4, estante = $5 WHERE e.id_libro = $1 AND ${ACTIVO}`,
        [id, u.piso.trim(), u.area.trim(), u.pasillo.trim(), u.estante.trim()]);
      await cliente.query("UPDATE AVISOS_PERSONAL SET atendido = TRUE WHERE tipo = 'Libro sin ubicación' AND id_libro = $1", [id]);
      await registrarCambios(cliente, "Libro", id, [["ubicación", antes.map((a) => a.texto).join(", "), textoUbicacion(u)]], autor.id);
      await registrarEnBitacora(cliente, SERVICIO, "Ubicación actualizada", `${claveLibro(id)} → ${textoUbicacion(u)}`, autor.id);
      return { mensaje: "Ubicación actualizada." };
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
        throw new ErrorDeNegocio("La ficha tiene préstamos registrados y se conserva como evidencia.", ["Da de baja sus ejemplares con la opción Baja de libros para retirarlos de circulación."]);
      }
      await cliente.query("DELETE FROM EJEMPLARES WHERE id_libro = $1", [id]);
      await cliente.query("DELETE FROM LIBROS WHERE id_libro = $1", [id]);
      await registrarEnBitacora(cliente, SERVICIO, "Ficha eliminada", `${id} · ${libro.titulo}`, autor.id);
      return { mensaje: "Ficha eliminada." };
    });
  }

  async nuevosEjemplares(id: number, datos: NuevosEjemplaresDto, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const libro = await consultarUno<{ isbn: string; total: number }>(`SELECT l.isbn, (SELECT COUNT(*)::int FROM EJEMPLARES e WHERE e.id_libro = l.id_libro AND ${ACTIVO}) AS total
        FROM LIBROS l WHERE l.id_libro = $1 FOR UPDATE`, [id], cliente);
      if (!libro) throw new NoEncontrado("El libro");
      await validarUbicacion(cliente, datos.ubicacion);
      const claves = await agregarEjemplares(cliente, id, libro.isbn, datos.cantidad, datos.ubicacion);
      await registrarCambios(cliente, "Libro", id, [["ejemplares", libro.total, libro.total + datos.cantidad]], autor.id);
      await registrarEnBitacora(cliente, SERVICIO, "Ejemplares agregados", `${claveLibro(id)}: ${claves.join(", ")}`, autor.id);
      return { mensaje: `Libro actualizado: se agregaron ${claves.length} ejemplar(es) disponibles (${claves.join(", ")}).`, claves };
    });
  }

  /** Estado de un ejemplar (perdido, dañado…) y su ubicación. */
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
      if (u) await validarUbicacion(cliente, u);
      await cliente.query(`UPDATE EJEMPLARES SET estado = COALESCE($2, estado), piso = COALESCE($3, piso), area = COALESCE($4, area),
          pasillo = COALESCE($5, pasillo), estante = COALESCE($6, estante) WHERE id_ejemplar = $1`,
        [idEjemplar, cambio.estado ?? null, u?.piso.trim() ?? null, u?.area.trim() ?? null, u?.pasillo.trim() ?? null, u?.estante.trim() ?? null]);
      await registrarEnBitacora(cliente, SERVICIO, "Ejemplar actualizado", `${ejemplar.clave_ejemplar}: ${ejemplar.estado} → ${cambio.estado ?? ejemplar.estado}`, autor.id);
      return { mensaje: `Ejemplar ${ejemplar.clave_ejemplar} actualizado.` };
    });
  }

  /** Baja de libros (HU2-SP1). */
  async darDeBajaEjemplar(datos: BajaEjemplarDto, autor: Sesion) {
    const clave = datos.clave.trim();
    if (!clave) throw new DatosInvalidos("Captura la clave del ejemplar.", [], ["clave"]);
    return enTransaccion(async (cliente) => {
      const ejemplar = await consultarUno<{ id_ejemplar: number; id_libro: number; estado: EstadoEjemplar; reservado: boolean }>(`
        SELECT e.id_ejemplar, e.id_libro, e.estado,
               (e.estado = 'Disponible' AND EXISTS (SELECT 1 FROM LISTA_ESPERA w WHERE w.id_libro = e.id_libro AND w.estado = 'Notificado')
                 AND (SELECT COUNT(*) FROM EJEMPLARES d WHERE d.id_libro = e.id_libro AND d.estado = 'Disponible')
                     <= (SELECT COUNT(*) FROM LISTA_ESPERA w WHERE w.id_libro = e.id_libro AND w.estado = 'Notificado')) AS reservado
        FROM EJEMPLARES e WHERE LOWER(e.clave_ejemplar) = LOWER($1) FOR UPDATE OF e`, [clave], cliente);
      if (!ejemplar) throw new ErrorDeNegocio(`La clave ${clave} no existe.`, [], ["clave"]);
      const problema = validarBajaEjemplar(ejemplar.estado, ejemplar.reservado, datos.motivo || undefined);
      if (problema) throw new ErrorDeNegocio(problema, [], problema.startsWith("Selecciona") ? ["motivo"] : []);
      await cliente.query(`UPDATE EJEMPLARES SET estado = 'Dado de baja', motivo_baja = $2, fecha_baja = CURRENT_TIMESTAMP, id_credencial_baja = $3
        WHERE id_ejemplar = $1`, [ejemplar.id_ejemplar, datos.motivo, autor.id]);
      const { activos } = (await consultarUno<{ activos: number }>(`SELECT COUNT(*)::int AS activos FROM EJEMPLARES e WHERE e.id_libro = $1 AND ${ACTIVO}`, [ejemplar.id_libro], cliente))!;
      await registrarCambios(cliente, "Libro", ejemplar.id_libro, [[`ejemplar ${clave}`, ejemplar.estado, `Dado de baja (${datos.motivo})`]], autor.id);
      await registrarEnBitacora(cliente, SERVICIO, "Baja de ejemplar", `${clave}: ${datos.motivo}`, autor.id);
      return activos === 0
        ? { mensaje: "Se dio de baja el último ejemplar y el libro ya no aparecerá en las búsquedas.", ultimo: true }
        : { mensaje: "Ejemplar dado de baja.", ultimo: false, disponibles: activos };
    });
  }

  /** Listado de libros por filtro para inventario (HU6-SP1): un renglón por ejemplar. */
  async inventario(f: FiltroInventarioDto) {
    const filtros = [f.tema, f.autor, f.editorial, f.estado, f.piso, f.area, f.pasillo].map((v) => v?.trim() || null);
    if (filtros.every((v) => v === null)) throw new DatosInvalidos("Elige al menos un filtro para generar el listado.");
    return consultar(`
      SELECT e.clave_ejemplar AS clave, 'LIB-' || LPAD(l.id_libro::text, 4, '0') AS "claveLibro", l.titulo,
             (SELECT string_agg(a.nombre_autor, ', ' ORDER BY a.nombre_autor) FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro) AS autores,
             ed.nombre_editorial AS editorial, t.nombre_tema AS tema, e.estado, e.piso, e.area, e.pasillo, e.estante
      FROM EJEMPLARES e JOIN LIBROS l ON l.id_libro = e.id_libro
      JOIN EDITORIALES ed ON ed.id_editorial = l.id_editorial JOIN TEMAS t ON t.id_tema = l.id_tema
      WHERE ($1::text IS NULL OR t.nombre_tema = $1)
        AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro AND a.nombre_autor ILIKE '%' || $2 || '%'))
        AND ($3::text IS NULL OR ed.nombre_editorial = $3)
        AND ($4::text IS NULL OR e.estado = $4)
        AND ($5::text IS NULL OR e.piso = $5)
        AND ($6::text IS NULL OR e.area = $6)
        AND ($7::text IS NULL OR e.pasillo = $7)
      ORDER BY e.piso NULLS LAST, e.area, e.pasillo, e.estante, l.titulo, e.clave_ejemplar`, filtros);
  }

  async historial(id: number) {
    return consultar(`SELECT h.campo, h.valor_anterior AS "valorAnterior", h.valor_nuevo AS "valorNuevo", h.fecha, c.matricula_nomina AS autor
      FROM HISTORIAL_CAMBIOS h JOIN CREDENCIALES c ON c.id_credencial = h.id_credencial
      WHERE h.entidad = 'Libro' AND h.id_entidad = $1 ORDER BY h.fecha DESC, h.id_cambio DESC`, [id]);
  }

  async catalogos() {
    const [temas, editoriales, ubicaciones] = await Promise.all([
      consultar<{ nombre: string }>("SELECT nombre_tema AS nombre FROM TEMAS ORDER BY 1"),
      consultar<{ nombre: string }>("SELECT nombre_editorial AS nombre FROM EDITORIALES ORDER BY 1"),
      consultar<{ piso: string; area: string; pasillo: string; estante: string }>("SELECT piso, area, pasillo, estante FROM UBICACIONES ORDER BY 1, 2, 3, 4"),
    ]);
    const unicos = (campo: "piso" | "area" | "pasillo" | "estante") => [...new Set(ubicaciones.map((u) => u[campo]))].sort();
    return { temas: temas.map((t) => t.nombre), editoriales: editoriales.map((e) => e.nombre), pisos: unicos("piso"), areas: unicos("area"), pasillos: unicos("pasillo"), estantes: unicos("estante"), ubicaciones };
  }

  async registrarUbicacion(u: NuevaUbicacionDto, autor: Sesion) {
    const r = await obtenerPool().query("INSERT INTO UBICACIONES (piso, area, pasillo, estante) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      [u.piso.trim(), u.area.trim(), u.pasillo.trim(), u.estante.trim()]);
    if (!r.rowCount) throw new ErrorDeNegocio(`La ubicación ${textoUbicacion(u)} ya existe.`);
    await registrarEnBitacora(obtenerPool(), SERVICIO, "Ubicación registrada", textoUbicacion(u), autor.id);
    return { mensaje: `Ubicación ${textoUbicacion(u)} registrada.` };
  }

  /**
   * Avisos para el personal: libros sin ubicación que alguien buscó (HU1-SP2) y
   * libros comprados pendientes de dar de alta (HU5-SP1). Se marcan como atendidos
   * en cuanto el libro ya tiene ubicación o ya está en el catálogo.
   */
  async avisos() {
    await obtenerPool().query(`UPDATE AVISOS_PERSONAL a SET atendido = TRUE WHERE NOT atendido AND (
        (tipo = 'Libro por dar de alta' AND EXISTS (SELECT 1 FROM LIBROS l WHERE l.isbn = a.isbn))
        OR (tipo = 'Libro sin ubicación' AND NOT EXISTS (SELECT 1 FROM EJEMPLARES e WHERE e.id_libro = a.id_libro AND e.piso IS NULL AND ${ACTIVO})))`);
    return consultar(`SELECT id_aviso AS id, tipo, id_libro AS "idLibro", isbn, mensaje, fecha FROM AVISOS_PERSONAL WHERE NOT atendido ORDER BY fecha DESC`);
  }

  // ── Solicitudes de compra ─────────────────────────────────────────────────
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
      return { id: fila!.id_solicitud, mensaje: "Solicitud de compra registrada." };
    });
  }

  async decidirSolicitud(id: number, estatus: "Aprobada" | "Rechazada", autor: Sesion) {
    if (!permisosDe(autor).includes("compras")) throw new ErrorDeNegocio("Solo el administrador (permiso de Compra de libros) aprueba o rechaza solicitudes de compra.");
    return enTransaccion(async (cliente) => {
      const r = await cliente.query("UPDATE SOLICITUDES_COMPRA SET estatus = $2 WHERE id_solicitud = $1 AND estatus = 'Pendiente'", [id, estatus]);
      if (!r.rowCount) throw new ErrorDeNegocio("La solicitud no existe o ya fue resuelta.");
      await registrarEnBitacora(cliente, SERVICIO, `Solicitud ${estatus.toLowerCase()}`, `solicitud ${id}`, autor.id);
      return { mensaje: `Solicitud ${estatus.toLowerCase()}.` };
    });
  }

  // ── Compra de libros (HU5-SP1) ────────────────────────────────────────────
  private async presupuestoDelMes(ejecutor: Ejecutor, bloquear = false) {
    // Dos órdenes al mismo tiempo no pueden gastar el mismo presupuesto.
    if (bloquear) await ejecutor.query("SELECT pg_advisory_xact_lock(hashtext('sigeb-presupuesto'))");
    const fila = await consultarUno<{ anio: number; mes: number; monto: number | null; comprometido: number }>(`
      SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS anio, EXTRACT(MONTH FROM CURRENT_DATE)::int AS mes,
             (SELECT p.monto_mxn::float FROM PRESUPUESTOS p WHERE p.anio = EXTRACT(YEAR FROM CURRENT_DATE) AND p.mes = EXTRACT(MONTH FROM CURRENT_DATE)) AS monto,
             COALESCE((SELECT SUM(o.total_mxn)::float FROM ORDENES_COMPRA o WHERE date_trunc('month', o.fecha) = date_trunc('month', CURRENT_DATE)), 0) AS comprometido`, [], ejecutor);
    const monto = fila!.monto ?? 0;
    return { anio: fila!.anio, mes: fila!.mes, montoMxn: monto, comprometidoMxn: fila!.comprometido, disponibleMxn: Math.round((monto - fila!.comprometido) * 100) / 100, definido: fila!.monto !== null };
  }

  presupuesto() { return this.presupuestoDelMes(obtenerPool()); }

  async fijarPresupuesto(montoMxn: number, autor: Sesion) {
    await obtenerPool().query(`INSERT INTO PRESUPUESTOS (anio, mes, monto_mxn) VALUES (EXTRACT(YEAR FROM CURRENT_DATE), EXTRACT(MONTH FROM CURRENT_DATE), $1)
      ON CONFLICT (anio, mes) DO UPDATE SET monto_mxn = EXCLUDED.monto_mxn`, [montoMxn]);
    await registrarEnBitacora(obtenerPool(), SERVICIO, "Presupuesto del mes", formatoPesos(montoMxn), autor.id);
    return { mensaje: `Presupuesto del mes: ${formatoPesos(montoMxn)}.`, ...(await this.presupuesto()) };
  }

  async ordenes() {
    return consultar(`
      SELECT o.id_orden AS id, o.folio, o.editorial, o.total_mxn::float AS "totalMxn", o.estatus, o.fecha, o.fecha_recepcion AS "fechaRecepcion",
             c.matricula_nomina AS registro,
             COALESCE(json_agg(json_build_object('id', d.id_detalle, 'titulo', d.titulo, 'isbn', d.isbn, 'cantidad', d.cantidad,
               'recibida', d.cantidad_recibida, 'precioMxn', d.precio_unitario_mxn::float) ORDER BY d.id_detalle), '[]') AS libros
      FROM ORDENES_COMPRA o JOIN CREDENCIALES c ON c.id_credencial = o.id_credencial
      JOIN ORDEN_COMPRA_DETALLE d ON d.id_orden = o.id_orden
      GROUP BY o.id_orden, c.matricula_nomina ORDER BY o.fecha DESC`);
  }

  async registrarOrden(datos: OrdenCompraDto, autor: Sesion) {
    const libros = datos.libros.map((l, i) => ({ ...l, isbn: isbnValido(l.isbn, `libros.${i}.isbn`) }));
    const total = Math.round(libros.reduce((s, l) => s + l.cantidad * l.precioMxn, 0) * 100) / 100;
    return enTransaccion(async (cliente) => {
      const presupuesto = await this.presupuestoDelMes(cliente, true);
      const exceso = excesoPresupuesto(presupuesto.disponibleMxn, total);
      if (exceso > 0) {
        throw new ErrorDeNegocio(`La compra excede el presupuesto del mes por ${formatoPesos(exceso)}.`,
          [`Presupuesto disponible: ${formatoPesos(presupuesto.disponibleMxn)}`, `Total de la orden: ${formatoPesos(total)}`]);
      }
      for (const l of libros.filter((x) => x.idSolicitud)) {
        const s = await consultarUno<{ estatus: string }>("SELECT estatus FROM SOLICITUDES_COMPRA WHERE id_solicitud = $1 FOR UPDATE", [l.idSolicitud], cliente);
        if (s?.estatus !== "Aprobada") throw new ErrorDeNegocio(`La solicitud de "${l.titulo}" no está aprobada.`);
      }
      // El folio sale del mismo número de la orden: OC-000001.
      const { id: idOrden } = (await consultarUno<{ id: number }>("SELECT nextval(pg_get_serial_sequence('ordenes_compra', 'id_orden'))::int AS id", [], cliente))!;
      const folio = `OC-${String(idOrden).padStart(6, "0")}`;
      const orden = await consultarUno<{ id_orden: number }>(
        "INSERT INTO ORDENES_COMPRA (id_orden, folio, editorial, total_mxn, id_credencial) VALUES ($1, $2, $3, $4, $5) RETURNING id_orden",
        [idOrden, folio, datos.editorial.trim(), total, autor.id], cliente);
      for (const l of libros) {
        await cliente.query("INSERT INTO ORDEN_COMPRA_DETALLE (id_orden, id_solicitud, titulo, isbn, cantidad, precio_unitario_mxn) VALUES ($1, $2, $3, $4, $5, $6)",
          [orden!.id_orden, l.idSolicitud ?? null, l.titulo.trim(), l.isbn, l.cantidad, l.precioMxn]);
        if (l.idSolicitud) await cliente.query("UPDATE SOLICITUDES_COMPRA SET estatus = 'En compra' WHERE id_solicitud = $1", [l.idSolicitud]);
      }
      await registrarEnBitacora(cliente, SERVICIO, "Orden de compra", `${folio} · ${datos.editorial} · ${formatoPesos(total)}`, autor.id);
      return { folio, totalMxn: total, mensaje: `Orden de compra ${folio} registrada.`, disponibleMxn: Math.round((presupuesto.disponibleMxn - total) * 100) / 100 };
    });
  }

  /** Recepción de compra: completa o parcial; guarda el precio para la Regla 4 y avisa al bibliotecario. */
  async recibirOrden(id: number, datos: RecepcionDto, autor: Sesion) {
    return enTransaccion(async (cliente) => {
      const orden = await consultarUno<{ folio: string; estatus: string }>("SELECT folio, estatus FROM ORDENES_COMPRA WHERE id_orden = $1 FOR UPDATE", [id], cliente);
      if (!orden) throw new NoEncontrado("La orden de compra");
      if (orden.estatus === "Recibida") throw new ErrorDeNegocio(`La orden ${orden.folio} ya se recibió completa.`);
      const detalles = await consultar<{ id_detalle: number; id_solicitud: number | null; titulo: string; isbn: string; cantidad: number; cantidad_recibida: number; precio: number }>(
        "SELECT id_detalle, id_solicitud, titulo, isbn, cantidad, cantidad_recibida, precio_unitario_mxn::float AS precio FROM ORDEN_COMPRA_DETALLE WHERE id_orden = $1 ORDER BY id_detalle", [id], cliente);
      const tipoCambio = (await consultarUno<{ valor: number }>("SELECT valor_mxn::float AS valor FROM TIPO_CAMBIO ORDER BY fecha DESC LIMIT 1", [], cliente))?.valor;
      let recibidosAhora = 0;
      for (const r of datos.recibidos) {
        const d = detalles.find((x) => x.id_detalle === r.idDetalle);
        if (!d) throw new ErrorDeNegocio("Uno de los libros no pertenece a la orden.");
        const pendiente = d.cantidad - d.cantidad_recibida;
        if (r.cantidad > pendiente) throw new ErrorDeNegocio(`De "${d.titulo}" solo faltan ${pendiente} por recibir.`);
        if (r.cantidad === 0) continue;
        d.cantidad_recibida += r.cantidad; recibidosAhora += r.cantidad;
        await cliente.query("UPDATE ORDEN_COMPRA_DETALLE SET cantidad_recibida = $2 WHERE id_detalle = $1", [d.id_detalle, d.cantidad_recibida]);
        // Precio de compra → precio en USD de la ficha (Regla 4: costo de reposición).
        if (tipoCambio) await cliente.query("UPDATE LIBROS SET precio_ultima_compra_usd = $2 WHERE isbn = $1", [d.isbn, precioUsdDeCompra(d.precio, tipoCambio)]);
        if (d.id_solicitud && d.cantidad_recibida === d.cantidad) await cliente.query("UPDATE SOLICITUDES_COMPRA SET estatus = 'Comprada' WHERE id_solicitud = $1", [d.id_solicitud]);
        const enCatalogo = await consultarUno("SELECT 1 FROM LIBROS WHERE isbn = $1", [d.isbn], cliente);
        await cliente.query("INSERT INTO AVISOS_PERSONAL (tipo, isbn, mensaje) VALUES ('Libro por dar de alta', $1, $2)",
          [d.isbn, `${enCatalogo ? "Agrega" : "Da de alta"} ${r.cantidad} ejemplar(es) de "${d.titulo}" (ISBN ${d.isbn}), recibidos en la orden ${orden.folio}.`]);
      }
      if (recibidosAhora === 0) throw new ErrorDeNegocio("Captura cuántos libros llegaron.");
      const { faltan, estatus } = estadoRecepcion(detalles.map((d) => ({ cantidad: d.cantidad, recibida: d.cantidad_recibida })));
      await cliente.query("UPDATE ORDENES_COMPRA SET estatus = $2, fecha_recepcion = CURRENT_TIMESTAMP WHERE id_orden = $1", [id, estatus]);
      await registrarEnBitacora(cliente, SERVICIO, "Recepción de compra", `${orden.folio}: ${recibidosAhora} recibidos, faltan ${faltan}`, autor.id);
      const aviso = "Se avisó al bibliotecario que tiene libros pendientes de dar de alta.";
      return faltan === 0
        ? { estatus, faltan, mensaje: "Compra recibida.", motivos: [aviso] }
        : { estatus, faltan, mensaje: `${faltan === 1 ? "Falta 1 libro" : `Faltan ${faltan} libros`} por recibir de la orden ${orden.folio}.`, motivos: [aviso] };
    });
  }
}
