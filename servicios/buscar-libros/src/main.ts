/**
 * Microservicio "Buscar libros" (Sprint 1 y HU1-SP2): búsqueda por autor, tema,
 * título, clave o editorial con la ubicación física de los ejemplares (piso,
 * área, pasillo y estante), para web y app móvil y para todos los perfiles.
 */
import "reflect-metadata";
import { Controller, Get, Injectable, Module, Query } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { PUERTOS } from "../../comun/config";
import { consultar, obtenerPool } from "../../comun/db";
import { DatosInvalidos, iniciarServicio } from "../../comun/nest";

export const CRITERIOS = ["titulo", "autor", "tema", "clave", "editorial"] as const;
export type Criterio = (typeof CRITERIOS)[number];

export class FiltroBusquedaDto {
  /** Búsqueda por criterio (HU1-SP2): el criterio elegido y el texto a buscar. */
  @IsOptional() @IsIn(CRITERIOS, { message: "Elige un criterio: autor, tema, título, clave o editorial." }) criterio?: Criterio;
  @IsOptional() @IsString() texto?: string;
  /** Búsqueda libre en título, autor, ISBN y tema (la usa la app móvil). */
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() tema?: string;
  @IsOptional() @IsString() autor?: string;
  @IsOptional() @IsString() piso?: string;
  @IsOptional() @Transform(({ value }) => value === "true" || value === true) @IsBoolean() soloDisponibles?: boolean;
}

/** Condición SQL de cada criterio sobre $1. */
const CONDICION: Record<Criterio, string> = {
  titulo: "sin_acentos(l.titulo) LIKE '%' || sin_acentos($1) || '%'",
  autor: "EXISTS (SELECT 1 FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro AND sin_acentos(a.nombre_autor) LIKE '%' || sin_acentos($1) || '%')",
  tema: "sin_acentos(t.nombre_tema) LIKE '%' || sin_acentos($1) || '%'",
  clave: "('LIB-' || LPAD(l.id_libro::text, 4, '0') ILIKE '%' || $1 || '%' OR l.isbn LIKE replace($1, '-', '') || '%' OR EXISTS (SELECT 1 FROM EJEMPLARES x WHERE x.id_libro = l.id_libro AND x.clave_ejemplar ILIKE '%' || $1 || '%'))",
  editorial: "sin_acentos(ed.nombre_editorial) LIKE '%' || sin_acentos($1) || '%'",
};
const LIBRE = `(sin_acentos(l.titulo) LIKE '%' || sin_acentos($1) || '%' OR l.isbn LIKE $1 || '%' OR sin_acentos(t.nombre_tema) LIKE '%' || sin_acentos($1) || '%' OR ${CONDICION.autor})`;

type Resultado = { id: number; titulo: string; ubicaciones: Array<{ piso: string | null }> };

@Injectable()
export class ServicioBusqueda {
  async buscar(f: FiltroBusquedaDto) {
    let condicion = LIBRE;
    let texto = f.q?.trim() || null;
    if (f.criterio) {
      texto = f.texto?.trim() ?? "";
      // HU1-SP2, escenario 1: el texto debe tener por lo menos 3 caracteres.
      if (texto.length < 3) throw new DatosInvalidos("Escribe por lo menos 3 caracteres para buscar.", [], ["texto"]);
      condicion = CONDICION[f.criterio];
    }
    const resultados = await consultar<Resultado>(`
      WITH libros AS (
        SELECT l.id_libro, l.isbn, l.titulo, l.tipo_uso, t.nombre_tema, ed.nombre_editorial, l.anio_publicacion
        FROM LIBROS l JOIN TEMAS t ON t.id_tema = l.id_tema JOIN EDITORIALES ed ON ed.id_editorial = l.id_editorial
        WHERE ($1::text IS NULL OR ${condicion})
          AND ($2::text IS NULL OR t.nombre_tema = $2)
          AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro AND sin_acentos(a.nombre_autor) LIKE '%' || sin_acentos($3) || '%'))
          AND ($4::text IS NULL OR EXISTS (SELECT 1 FROM EJEMPLARES x WHERE x.id_libro = l.id_libro AND x.piso = $4))
          -- HU2-SP1: un libro sin ejemplares activos ya no aparece en las búsquedas.
          AND EXISTS (SELECT 1 FROM EJEMPLARES x WHERE x.id_libro = l.id_libro AND x.estado <> 'Dado de baja')
      ),
      -- HU1-SP2, escenario 2: cada ubicación con sus copias disponibles.
      ubicaciones AS (
        SELECT e.id_libro, e.piso, e.area, e.pasillo, e.estante,
               COUNT(*) FILTER (WHERE e.estado = 'Disponible')::int AS disponibles, COUNT(*)::int AS total
        FROM EJEMPLARES e JOIN libros b ON b.id_libro = e.id_libro
        WHERE e.estado IN ('Disponible', 'Prestado')
        GROUP BY e.id_libro, e.piso, e.area, e.pasillo, e.estante
      )
      SELECT b.id_libro AS id, 'LIB-' || LPAD(b.id_libro::text, 4, '0') AS clave, b.isbn, b.titulo, b.tipo_uso AS "tipoUso", b.nombre_tema AS tema,
             b.nombre_editorial AS editorial, b.anio_publicacion AS "anioPublicacion",
             (SELECT string_agg(a.nombre_autor, ', ' ORDER BY a.nombre_autor) FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = b.id_libro) AS autores,
             COALESCE((SELECT SUM(u.total) FROM ubicaciones u WHERE u.id_libro = b.id_libro), 0)::int AS existencia,
             COALESCE((SELECT SUM(u.disponibles) FROM ubicaciones u WHERE u.id_libro = b.id_libro), 0)::int AS disponibles,
             COALESCE((SELECT json_agg(json_build_object('piso', u.piso, 'area', u.area, 'pasillo', u.pasillo, 'estante', u.estante,
                         'disponibles', u.disponibles, 'total', u.total) ORDER BY u.disponibles DESC, u.piso)
                       FROM ubicaciones u WHERE u.id_libro = b.id_libro), '[]') AS ubicaciones,
             -- HU1-SP2, escenario 3: fecha de devolución más próxima cuando no hay copias.
             (SELECT MIN(p.fecha_vencimiento) FROM PRESTAMOS p JOIN EJEMPLARES x ON x.id_ejemplar = p.id_ejemplar
               WHERE x.id_libro = b.id_libro AND p.estado = 'Activo') AS "proximaDevolucion"
      FROM libros b
      WHERE NOT $5::boolean OR EXISTS (SELECT 1 FROM ubicaciones u WHERE u.id_libro = b.id_libro AND u.disponibles > 0)
      ORDER BY b.titulo
      LIMIT 200`, [texto, f.tema || null, f.autor?.trim() || null, f.piso || null, f.soloDisponibles ?? false]);

    // HU1-SP2, escenario 5: libro sin ubicación registrada → aviso al bibliotecario.
    const sinUbicacion = resultados.filter((r) => r.ubicaciones.some((u) => u.piso === null));
    for (const r of sinUbicacion) {
      await obtenerPool().query(`INSERT INTO AVISOS_PERSONAL (tipo, id_libro, mensaje) VALUES ('Libro sin ubicación', $1, $2)
        ON CONFLICT (id_libro) WHERE tipo = 'Libro sin ubicación' AND NOT atendido DO NOTHING`,
        [r.id, `Registra la ubicación de "${r.titulo}": un usuario lo buscó y no tiene ubicación en el sistema.`]);
    }
    return resultados;
  }

  async filtros() {
    const [temas, pisos] = await Promise.all([
      consultar<{ v: string }>("SELECT nombre_tema AS v FROM TEMAS ORDER BY 1"),
      consultar<{ v: string }>("SELECT DISTINCT piso AS v FROM EJEMPLARES WHERE piso IS NOT NULL ORDER BY 1"),
    ]);
    return { temas: temas.map((t) => t.v), pisos: pisos.map((p) => p.v), criterios: CRITERIOS };
  }
}

@Controller("api/busqueda")
export class ControladorBusqueda {
  constructor(private readonly busqueda: ServicioBusqueda) {}
  @Get() buscar(@Query() filtro: FiltroBusquedaDto) { return this.busqueda.buscar(filtro); }
  @Get("filtros") filtros() { return this.busqueda.filtros(); }
}

@Module({ controllers: [ControladorBusqueda], providers: [ServicioBusqueda] })
export class ModuloBuscarLibros {}

if (require.main === module) void iniciarServicio(ModuloBuscarLibros, "buscar-libros", PUERTOS["buscar-libros"]);
