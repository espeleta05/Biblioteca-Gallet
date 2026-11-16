/**
 * Microservicio "Buscar libros" (Sprint 1): consulta de existencia y ubicación
 * de libros por diversos filtros, para web y app móvil y para todos los roles.
 */
import "reflect-metadata";
import { Controller, Get, Injectable, Module, Query } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { PUERTOS } from "../../comun/config";
import { consultar } from "../../comun/db";
import { iniciarServicio } from "../../comun/nest";

export class FiltroBusquedaDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() tema?: string;
  @IsOptional() @IsString() autor?: string;
  @IsOptional() @IsString() piso?: string;
  @IsOptional() @Transform(({ value }) => value === "true" || value === true) @IsBoolean() soloDisponibles?: boolean;
}

@Injectable()
export class ServicioBusqueda {
  buscar(f: FiltroBusquedaDto) {
    return consultar(`
      SELECT l.id_libro AS id, l.isbn, l.titulo, l.tipo_uso AS "tipoUso", t.nombre_tema AS tema, ed.nombre_editorial AS editorial,
             l.anio_publicacion AS "anioPublicacion",
             (SELECT string_agg(a.nombre_autor, ', ' ORDER BY a.nombre_autor) FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro) AS autores,
             COUNT(e.id_ejemplar) FILTER (WHERE e.estado IN ('Disponible','Prestado'))::int AS existencia,
             COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Disponible')::int AS disponibles,
             COALESCE(json_agg(DISTINCT jsonb_build_object('piso', e.piso, 'area', e.area, 'pasillo', e.pasillo, 'estante', e.estante))
               FILTER (WHERE e.estado = 'Disponible'), '[]') AS ubicaciones
      FROM LIBROS l
      JOIN TEMAS t ON t.id_tema = l.id_tema
      JOIN EDITORIALES ed ON ed.id_editorial = l.id_editorial
      LEFT JOIN EJEMPLARES e ON e.id_libro = l.id_libro
      WHERE ($1::text IS NULL OR l.titulo ILIKE '%' || $1 || '%' OR l.isbn LIKE $1 || '%' OR t.nombre_tema ILIKE '%' || $1 || '%'
             OR EXISTS (SELECT 1 FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro AND a.nombre_autor ILIKE '%' || $1 || '%'))
        AND ($2::text IS NULL OR t.nombre_tema = $2)
        AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM LIBRO_AUTOR la JOIN AUTORES a ON a.id_autor = la.id_autor WHERE la.id_libro = l.id_libro AND a.nombre_autor ILIKE '%' || $3 || '%'))
        AND ($4::text IS NULL OR EXISTS (SELECT 1 FROM EJEMPLARES x WHERE x.id_libro = l.id_libro AND x.piso = $4))
      GROUP BY l.id_libro, t.nombre_tema, ed.nombre_editorial
      HAVING NOT $5::boolean OR COUNT(e.id_ejemplar) FILTER (WHERE e.estado = 'Disponible') > 0
      ORDER BY l.titulo
      LIMIT 200`, [f.q?.trim() || null, f.tema ?? null, f.autor?.trim() || null, f.piso ?? null, f.soloDisponibles ?? false]);
  }

  async filtros() {
    const [temas, pisos] = await Promise.all([
      consultar<{ v: string }>("SELECT nombre_tema AS v FROM TEMAS ORDER BY 1"),
      consultar<{ v: string }>("SELECT DISTINCT piso AS v FROM EJEMPLARES ORDER BY 1"),
    ]);
    return { temas: temas.map((t) => t.v), pisos: pisos.map((p) => p.v) };
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
