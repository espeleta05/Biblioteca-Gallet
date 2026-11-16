"use client";
/** Buscar libros (Sprint 1): existencia y ubicación por diversos filtros. Todos los roles. */
import { useState } from "react";
import { api, consulta } from "../../lib/api";
import { Aviso, Etiqueta, Selector, Tabla, useDatos } from "../ui";

type Resultado = { id: number; isbn: string; titulo: string; autores: string; tema: string; editorial: string; tipoUso: string; existencia: number; disponibles: number; ubicaciones: Array<{ piso: string; area: string; pasillo: string; estante: string }> };

export function Busqueda() {
  const [filtro, setFiltro] = useState({ q: "", tema: "", autor: "", piso: "", soloDisponibles: false });
  const [enviado, setEnviado] = useState(filtro);
  const opciones = useDatos(() => api<{ temas: string[]; pisos: string[] }>("/api/busqueda/filtros"), []);
  const resultados = useDatos(() => api<Resultado[]>(`/api/busqueda${consulta(enviado)}`), [enviado]);
  const lista = resultados.datos ?? [];

  return (
    <>
      <div className="encabezado"><div><h2>Buscar libros</h2><p>Consulta la existencia y la ubicación de los libros de la biblioteca.</p></div></div>
      <form className="panel filtros" role="search" onSubmit={(e) => { e.preventDefault(); setEnviado(filtro); }}>
        <label className="campo"><span>Título, autor, ISBN o tema</span><input value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} /></label>
        <label className="campo"><span>Autor</span><input value={filtro.autor} onChange={(e) => setFiltro({ ...filtro, autor: e.target.value })} /></label>
        <Selector etiqueta="Tema" opciones={opciones.datos?.temas ?? []} todos="Todos los temas" valor={filtro.tema} alCambiar={(tema) => setFiltro({ ...filtro, tema })} />
        <Selector etiqueta="Piso" opciones={opciones.datos?.pisos ?? []} todos="Todos los pisos" valor={filtro.piso} alCambiar={(piso) => setFiltro({ ...filtro, piso })} />
        <label className="campo"><span>Disponibilidad</span>
          <span><input type="checkbox" checked={filtro.soloDisponibles} onChange={(e) => setFiltro({ ...filtro, soloDisponibles: e.target.checked })} /> Solo disponibles</span>
        </label>
        <button className="boton primario" type="submit">Buscar</button>
      </form>
      <Aviso mensaje={resultados.error} />
      <p role="status">{resultados.cargando ? "Buscando…" : `${lista.length} libro(s) encontrado(s).`}</p>
      <Tabla titulo="Resultados de la búsqueda" columnas={["Libro", "Tema", "Existencia", "Ubicación de ejemplares disponibles", "Uso"]} vacio="No se encontraron libros con esos filtros." cantidad={lista.length}>
        {lista.map((l) => (
          <tr key={l.id}>
            <td><b>{l.titulo}</b><small>{l.autores} · {l.editorial} · ISBN {l.isbn}</small></td>
            <td>{l.tema}</td>
            <td>{l.disponibles > 0 ? <Etiqueta color="verde">{l.disponibles} de {l.existencia} disponibles</Etiqueta> : <Etiqueta color="rojo">Sin ejemplares disponibles ({l.existencia} en existencia)</Etiqueta>}</td>
            <td>{l.ubicaciones.length ? l.ubicaciones.map((u) => <small key={`${u.piso}${u.pasillo}${u.estante}`}>{u.piso} · {u.area} · pasillo {u.pasillo} · estante {u.estante}</small>) : "—"}</td>
            <td>{l.tipoUso === "Préstamo externo" ? <Etiqueta color="azul">Préstamo externo</Etiqueta> : <Etiqueta color="naranja">{l.tipoUso}</Etiqueta>}</td>
          </tr>
        ))}
      </Tabla>
    </>
  );
}
