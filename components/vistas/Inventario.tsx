"use client";
/**
 * Listado de libros por filtro para inventario (HU6-SP1): un renglón por
 * ejemplar, con exportación a CSV e impresión. También el catálogo de
 * ubicaciones que existen en la Biblioteca (HU1-SP1, escenario 4).
 */
import { useState, type FormEvent } from "react";
import { api, consulta } from "../../lib/api";
import { Aviso, Campo, marcarCampos, mensajeDeError, mensajeDeExito, Paginacion, Selector, Tabla, usePaginacion, type Mensaje } from "../ui";

export type Catalogos = { temas: string[]; editoriales: string[]; pisos: string[]; areas: string[]; pasillos: string[]; estantes: string[]; ubicaciones: Array<{ piso: string; area: string; pasillo: string; estante: string }> };
type Renglon = { clave: string; claveLibro: string; titulo: string; autores: string; editorial: string; tema: string; estado: string; piso: string | null; area: string | null; pasillo: string | null; estante: string | null };

const ESTADOS = ["Disponible", "Prestado", "Perdido", "Robado", "Dañado", "Dado de baja"];
const VACIO = { tema: "", autor: "", editorial: "", estado: "", piso: "", area: "", pasillo: "" };
const NOMBRES: Record<keyof typeof VACIO, string> = { tema: "Tema", autor: "Autor", editorial: "Editorial", estado: "Estado", piso: "Piso", area: "Área", pasillo: "Pasillo" };
const ubicacion = (r: Renglon) => (r.piso ? `${r.piso} · ${r.area} · ${r.pasillo}-${r.estante}` : "Ubicación no disponible");
const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;
const escapar = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function Inventario({ catalogos }: { catalogos: Catalogos | null }) {
  const [filtro, setFiltro] = useState(VACIO);
  const [usados, setUsados] = useState(VACIO);
  const [renglones, setRenglones] = useState<Renglon[] | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const paginas = usePaginacion(renglones ?? []);
  const descripcionFiltros = (Object.keys(usados) as Array<keyof typeof VACIO>).filter((k) => usados[k]).map((k) => `${NOMBRES[k]} = ${usados[k]}`).join(", ");

  const generar = async (e: FormEvent) => {
    e.preventDefault();
    if (Object.values(filtro).every((v) => !v.trim())) { setRenglones(null); setMensaje({ tipo: "error", texto: "Elige al menos un filtro para generar el listado." }); return; }
    try { setRenglones(await api<Renglon[]>(`/api/libros/inventario${consulta(filtro)}`)); setUsados(filtro); setMensaje(null); }
    catch (err) { setMensaje(mensajeDeError(err)); }
  };
  const exportar = () => {
    if (!renglones) return;
    const lineas = [
      "Listado de ejemplares para inventario", `Fecha: ${new Date().toLocaleString("es-MX")}`, `Filtros: ${descripcionFiltros}`, `Total de ejemplares: ${renglones.length}`, "",
      ["Clave", "Libro", "Título", "Autores", "Editorial", "Tema", "Estado", "Ubicación"].join(","),
      ...renglones.map((r) => [r.clave, r.claveLibro, r.titulo, r.autores ?? "", r.editorial, r.tema, r.estado, ubicacion(r)].map(csv).join(",")),
    ];
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([`﻿${lineas.join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
    enlace.download = `inventario-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click(); URL.revokeObjectURL(enlace.href);
    setMensaje({ tipo: "exito", texto: "Listado generado." });
  };
  const imprimir = () => {
    if (!renglones) return;
    const ventana = window.open("", "_blank");
    if (!ventana) { setMensaje({ tipo: "error", texto: "El navegador bloqueó la ventana de impresión." }); return; }
    ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Listado para inventario</title>
      <style>body{font:12px system-ui;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px;text-align:left}</style></head><body>
      <h1>Listado de ejemplares para inventario</h1><p>Fecha: ${escapar(new Date().toLocaleString("es-MX"))}<br>Filtros: ${escapar(descripcionFiltros)}<br>Total de ejemplares: ${renglones.length}</p>
      <table><thead><tr><th>Clave</th><th>Título</th><th>Autores</th><th>Estado</th><th>Ubicación</th></tr></thead><tbody>
      ${renglones.map((r) => `<tr><td>${escapar(r.clave)}</td><td>${escapar(r.titulo)}</td><td>${escapar(r.autores ?? "")}</td><td>${escapar(r.estado)}</td><td>${escapar(ubicacion(r))}</td></tr>`).join("")}
      </tbody></table></body></html>`);
    ventana.document.close(); ventana.focus(); ventana.print();
    setMensaje({ tipo: "exito", texto: "Listado generado." });
  };

  return (
    <>
      <form className="panel filtros" role="search" aria-label="Filtros del listado para inventario" onSubmit={(e) => void generar(e)}>
        <Selector etiqueta="Tema" opciones={catalogos?.temas ?? []} todos="Cualquiera" valor={filtro.tema} alCambiar={(tema) => setFiltro({ ...filtro, tema })} />
        <label className="campo"><span>Autor</span><input value={filtro.autor} onChange={(e) => setFiltro({ ...filtro, autor: e.target.value })} /></label>
        <Selector etiqueta="Editorial" opciones={catalogos?.editoriales ?? []} todos="Cualquiera" valor={filtro.editorial} alCambiar={(editorial) => setFiltro({ ...filtro, editorial })} />
        <Selector etiqueta="Estado" opciones={ESTADOS} todos="Cualquiera" valor={filtro.estado} alCambiar={(estado) => setFiltro({ ...filtro, estado })} />
        <Selector etiqueta="Piso" opciones={catalogos?.pisos ?? []} todos="Cualquiera" valor={filtro.piso} alCambiar={(piso) => setFiltro({ ...filtro, piso })} />
        <Selector etiqueta="Área" opciones={catalogos?.areas ?? []} todos="Cualquiera" valor={filtro.area} alCambiar={(area) => setFiltro({ ...filtro, area })} />
        <Selector etiqueta="Pasillo" opciones={catalogos?.pasillos ?? []} todos="Cualquiera" valor={filtro.pasillo} alCambiar={(pasillo) => setFiltro({ ...filtro, pasillo })} />
        <button className="boton primario" type="submit">Generar listado</button>
      </form>
      <Aviso mensaje={mensaje} alCerrar={() => setMensaje(null)} />
      {renglones && (
        <>
          <div className="encabezado">
            <p role="status">{renglones.length} ejemplar(es) · {descripcionFiltros}</p>
            {renglones.length > 0 && <div className="acciones"><button className="boton" onClick={exportar}>Exportar CSV</button><button className="boton" onClick={imprimir}>Imprimir</button></div>}
          </div>
          <Tabla titulo="Listado de ejemplares" columnas={["Clave", "Libro", "Estado", "Ubicación"]} vacio="No hay libros que cumplan con esos filtros." cantidad={renglones.length} pie={<Paginacion {...paginas} />}>
            {paginas.visibles.map((r) => (
              <tr key={r.clave}><td>{r.clave}<small>{r.claveLibro}</small></td><td><b>{r.titulo}</b><small>{r.autores} · {r.editorial} · {r.tema}</small></td><td>{r.estado}</td><td>{ubicacion(r)}</td></tr>
            ))}
          </Tabla>
        </>
      )}
    </>
  );
}

export function Ubicaciones({ catalogos, alCambiar }: { catalogos: Catalogos | null; alCambiar: () => void }) {
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const lista = catalogos?.ubicaciones ?? [];
  const paginas = usePaginacion(lista);
  const registrar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const formulario = e.currentTarget; marcarCampos(formulario);
    const d = Object.fromEntries(new FormData(formulario)) as Record<string, string>;
    try { setMensaje(mensajeDeExito(await api("/api/libros/ubicaciones", { metodo: "POST", cuerpo: d }), "Ubicación registrada.")); formulario.reset(); alCambiar(); }
    catch (err) { marcarCampos(formulario, err); setMensaje(mensajeDeError(err)); }
  };
  return (
    <>
      <form className="panel" noValidate onSubmit={(e) => void registrar(e)}>
        <h3>Registrar una ubicación de la Biblioteca</h3>
        <div className="rejilla">
          <Campo etiqueta="Piso" nombre="piso" requerido sugerencias={catalogos?.pisos} /><Campo etiqueta="Área" nombre="area" requerido sugerencias={catalogos?.areas} />
          <Campo etiqueta="Pasillo" nombre="pasillo" requerido /><Campo etiqueta="Estante" nombre="estante" requerido />
        </div>
        <div className="acciones"><button className="boton primario">Registrar ubicación</button></div>
      </form>
      <Aviso mensaje={mensaje} alCerrar={() => setMensaje(null)} />
      <Tabla titulo="Ubicaciones que existen en la Biblioteca" columnas={["Piso", "Área", "Pasillo", "Estante"]} vacio="No hay ubicaciones registradas." cantidad={lista.length} pie={<Paginacion {...paginas} />}>
        {paginas.visibles.map((u) => <tr key={`${u.piso}${u.area}${u.pasillo}${u.estante}`}><td>{u.piso}</td><td>{u.area}</td><td>{u.pasillo}</td><td>{u.estante}</td></tr>)}
      </Tabla>
    </>
  );
}
