"use client";
/**
 * Buscar libros (HU1-SP2): por autor, tema, título, clave o editorial, con la
 * ubicación física (piso, área, pasillo y estante) y las copias disponibles en
 * cada una. Todos los perfiles con el permiso "Buscar libros".
 */
import { useState, type FormEvent } from "react";
import { api, consulta, fecha } from "../../lib/api";
import { Aviso, Casilla, Etiqueta, mensajeDeError, Paginacion, Selector, Tabla, usePaginacion, type Mensaje } from "../ui";

type Ubicacion = { piso: string | null; area: string | null; pasillo: string | null; estante: string | null; disponibles: number; total: number };
type Resultado = { id: number; clave: string; isbn: string; titulo: string; autores: string; tema: string; editorial: string; tipoUso: string; existencia: number; disponibles: number; ubicaciones: Ubicacion[]; proximaDevolucion: string | null };

const CRITERIOS = [
  { valor: "titulo", texto: "Título" }, { valor: "autor", texto: "Autor" }, { valor: "tema", texto: "Tema" },
  { valor: "clave", texto: "Clave o ISBN" }, { valor: "editorial", texto: "Editorial" },
];

export function Busqueda() {
  const [filtro, setFiltro] = useState({ criterio: "titulo", texto: "", soloDisponibles: false });
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [buscando, setBuscando] = useState(false);
  const paginas = usePaginacion(resultados ?? []);

  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    if (filtro.texto.trim().length < 3) { setResultados(null); setMensaje({ tipo: "error", texto: "Escribe por lo menos 3 caracteres para buscar." }); return; }
    setBuscando(true);
    try {
      const lista = await api<Resultado[]>(`/api/busqueda${consulta(filtro)}`);
      setResultados(lista);
      // Escenario 4: sin resultados se sugiere buscar con otro criterio.
      setMensaje(lista.length ? null : { tipo: "info", texto: "No se encontraron libros con ese criterio.", motivos: [`Prueba buscando por otro criterio: ${CRITERIOS.filter((c) => c.valor !== filtro.criterio).map((c) => c.texto.toLowerCase()).join(", ")}.`] });
    } catch (err) { setMensaje(mensajeDeError(err)); } finally { setBuscando(false); }
  };

  return (
    <>
      <form className="panel filtros" role="search" aria-label="Búsqueda de libros en la Biblioteca" onSubmit={(e) => void buscar(e)}>
        <Selector etiqueta="Buscar por" opciones={CRITERIOS.map((c) => c.texto)} valor={CRITERIOS.find((c) => c.valor === filtro.criterio)!.texto}
          alCambiar={(t) => setFiltro({ ...filtro, criterio: CRITERIOS.find((c) => c.texto === t)!.valor })} />
        <label className="campo ancho"><span>Texto a buscar (mínimo 3 caracteres)</span><input value={filtro.texto} onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} /></label>
        <Casilla etiqueta="Solo disponibles" marcada={filtro.soloDisponibles} alCambiar={(soloDisponibles) => setFiltro({ ...filtro, soloDisponibles })} />
        <button className="boton primario" type="submit">Buscar</button>
      </form>
      <Aviso mensaje={mensaje} alCerrar={() => setMensaje(null)} />
      {buscando && <p role="status">Buscando…</p>}
      {resultados && resultados.length > 0 && (
        <>
          <p role="status">{resultados.length} libro(s) encontrado(s).</p>
          <Tabla titulo="Resultados de la búsqueda" columnas={["Libro", "Copias disponibles", "Ubicación en la Biblioteca", "Uso"]} vacio="" cantidad={resultados.length} pie={<Paginacion {...paginas} />}>
            {paginas.visibles.map((l) => (
              <tr key={l.id}>
                <td><b>{l.titulo}</b><small>{l.autores} · {l.editorial} · {l.tema}</small><small>{l.clave} · ISBN {l.isbn}</small></td>
                <td>
                  {l.disponibles > 0
                    ? <Etiqueta color="verde">{l.disponibles} de {l.existencia} disponibles</Etiqueta>
                    : <><Etiqueta color="rojo">Sin copias disponibles</Etiqueta>{l.proximaDevolucion && <small>Devolución más próxima: {fecha(l.proximaDevolucion)}</small>}</>}
                </td>
                <td>
                  {l.ubicaciones.map((u, i) => u.piso
                    ? <small key={i}>{u.piso} · {u.area} · pasillo {u.pasillo} · estante {u.estante} — {u.disponibles} disponible(s)</small>
                    : <small key={i}><Etiqueta color="naranja">Ubicación no disponible</Etiqueta> Pregunta en el mostrador.</small>)}
                </td>
                <td>{l.tipoUso === "Préstamo externo" ? <Etiqueta color="azul">Préstamo externo</Etiqueta> : <Etiqueta color="naranja">{l.tipoUso}</Etiqueta>}</td>
              </tr>
            ))}
          </Tabla>
        </>
      )}
    </>
  );
}
