"use client";
/**
 * Gestionar libros (Sprint 1): ficha bibliográfica con precio en dólares, estado
 * y ubicación de cada ejemplar, listado por diversos filtros y solicitud de compra.
 */
import { useState, type FormEvent } from "react";
import { api, consulta, fecha, type Sesion } from "../../lib/api";
import { Aviso, Campo, Etiqueta, mensajeDeError, Modal, Selector, Tabla, useDatos, type Mensaje } from "../ui";

const TIPOS_USO = ["Préstamo externo", "Consulta interna", "Reservado"] as const;
const ESTADOS = ["Disponible", "Prestado", "Perdido", "Robado", "Dañado"] as const;

type Libro = { id: number; isbn: string; titulo: string; autores: string; editorial: string; tema: string; tipoUso: string; precioUsd: number; total: number; disponibles: number; prestados: number; fueraDeServicio: number };
type Ejemplar = { id: number; clave: string; estado: string; piso: string; area: string; pasillo: string; estante: string };
type Ficha = Omit<Libro, "autores"> & { autores: string[]; edicion: number | null; anioPublicacion: number | null; paginas: number | null; ejemplares: Ejemplar[] };
type Solicitud = { id: number; titulo: string; autor: string; cantidad: number; justificacion: string; estatus: string; fecha: string; solicitante: string };

const datosForm = (e: FormEvent<HTMLFormElement>) => Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
const numero = (v: string | undefined) => (v ? Number(v) : undefined);

function fichaDesdeFormulario(d: Record<string, string>) {
  return {
    isbn: d.isbn, titulo: d.titulo, autores: d.autores.split(";").map((a) => a.trim()).filter(Boolean), editorial: d.editorial, tema: d.tema,
    edicion: numero(d.edicion), anioPublicacion: numero(d.anioPublicacion), paginas: numero(d.paginas), tipoUso: d.tipoUso, precioUsd: Number(d.precioUsd),
  };
}

function CamposFicha({ ficha }: { ficha?: Ficha }) {
  return (
    <>
      <div className="rejilla">
        <Campo etiqueta="ISBN" nombre="isbn" requerido valorInicial={ficha?.isbn} ayuda="10 o 13 dígitos; se valida el dígito verificador." />
        <Campo etiqueta="Título" nombre="titulo" requerido valorInicial={ficha?.titulo} />
      </div>
      <Campo etiqueta="Autores" nombre="autores" requerido valorInicial={ficha?.autores.join("; ")} ayuda="Separa varios autores con punto y coma." />
      <div className="rejilla">
        <Campo etiqueta="Editorial" nombre="editorial" requerido valorInicial={ficha?.editorial} />
        <Campo etiqueta="Tema" nombre="tema" requerido valorInicial={ficha?.tema} />
        <Campo etiqueta="Edición" nombre="edicion" tipo="number" min={1} valorInicial={ficha?.edicion ?? undefined} />
        <Campo etiqueta="Año de publicación" nombre="anioPublicacion" tipo="number" min={1450} max={2100} valorInicial={ficha?.anioPublicacion ?? undefined} />
        <Campo etiqueta="Páginas" nombre="paginas" tipo="number" min={1} valorInicial={ficha?.paginas ?? undefined} />
        <Campo etiqueta="Precio de la última compra (USD)" nombre="precioUsd" tipo="number" min={0} paso="0.01" requerido valorInicial={ficha?.precioUsd} ayuda="Se usa para el costo de reposición (Regla 4)." />
      </div>
      <Selector etiqueta="Tipo de uso" nombre="tipoUso" opciones={TIPOS_USO} valor={ficha?.tipoUso ?? "Préstamo externo"} />
    </>
  );
}

function CamposUbicacion() {
  return (
    <div className="rejilla">
      <Campo etiqueta="Piso" nombre="piso" requerido /><Campo etiqueta="Área" nombre="area" requerido />
      <Campo etiqueta="Pasillo" nombre="pasillo" requerido /><Campo etiqueta="Estante" nombre="estante" requerido />
    </div>
  );
}

export function Catalogo({ sesion }: { sesion: Sesion }) {
  const [pestana, setPestana] = useState<"libros" | "compras">("libros");
  const [filtro, setFiltro] = useState({ q: "", tema: "", tipoUso: "", estado: "", piso: "" });
  const [modal, setModal] = useState<"nueva" | "ficha" | "compra" | null>(null);
  const [fichaAbierta, setFichaAbierta] = useState<Ficha | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const catalogos = useDatos(() => api<{ temas: string[]; pisos: string[] }>("/api/libros/catalogos"), []);
  const libros = useDatos(() => api<Libro[]>(`/api/libros${consulta(filtro)}`), [filtro]);
  const solicitudes = useDatos(() => api<Solicitud[]>("/api/solicitudes-compra"), [pestana]);

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    try { await accion(); setMensaje({ tipo: "exito", texto: exito }); await libros.recargar(); return true; } catch (e) { setMensaje(mensajeDeError(e)); return false; }
  };
  const abrirFicha = async (id: number) => {
    try { setFichaAbierta(await api<Ficha>(`/api/libros/${id}`)); setModal("ficha"); } catch (e) { setMensaje(mensajeDeError(e)); }
  };
  const crear = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const d = datosForm(e);
    const ok = await ejecutar(() => api("/api/libros", { metodo: "POST", cuerpo: { ...fichaDesdeFormulario(d), ejemplares: Number(d.ejemplares), ubicacion: { piso: d.piso, area: d.area, pasillo: d.pasillo, estante: d.estante } } }), "Ficha bibliográfica creada.");
    if (ok) setModal(null);
  };
  const actualizar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!fichaAbierta) return;
    if (await ejecutar(() => api(`/api/libros/${fichaAbierta.id}`, { metodo: "PATCH", cuerpo: fichaDesdeFormulario(datosForm(e)) }), "Ficha actualizada.")) await abrirFicha(fichaAbierta.id);
  };
  const cambiarEstado = async (ej: Ejemplar, estado: string) => {
    if (!fichaAbierta) return;
    if (await ejecutar(() => api(`/api/libros/${fichaAbierta.id}/ejemplares/${ej.id}`, { metodo: "PATCH", cuerpo: { estado } }), `Ejemplar ${ej.clave}: ${estado}.`)) await abrirFicha(fichaAbierta.id);
  };
  const agregarEjemplares = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!fichaAbierta) return; const d = datosForm(e);
    if (await ejecutar(() => api(`/api/libros/${fichaAbierta.id}/ejemplares`, { metodo: "POST", cuerpo: { cantidad: Number(d.cantidad), ubicacion: { piso: d.piso, area: d.area, pasillo: d.pasillo, estante: d.estante } } }), "Ejemplares agregados.")) await abrirFicha(fichaAbierta.id);
  };
  const eliminar = async () => {
    if (!fichaAbierta || !window.confirm(`¿Eliminar la ficha de "${fichaAbierta.titulo}"? Solo es posible si nunca se prestó.`)) return;
    if (await ejecutar(() => api(`/api/libros/${fichaAbierta.id}`, { metodo: "DELETE" }), "Ficha eliminada.")) setModal(null);
  };
  const solicitarCompra = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const d = datosForm(e);
    try {
      await api("/api/solicitudes-compra", { metodo: "POST", cuerpo: { titulo: d.titulo, autor: d.autor, isbn: d.isbn || undefined, cantidad: Number(d.cantidad), justificacion: d.justificacion } });
      setMensaje({ tipo: "exito", texto: "Solicitud de compra registrada." }); setModal(null); await solicitudes.recargar();
    } catch (err) { setMensaje(mensajeDeError(err)); }
  };
  const decidir = async (id: number, estatus: "Aprobada" | "Rechazada") => {
    try { await api(`/api/solicitudes-compra/${id}`, { metodo: "PATCH", cuerpo: { estatus } }); await solicitudes.recargar(); } catch (e) { setMensaje(mensajeDeError(e)); }
  };

  const lista = libros.datos ?? [];
  return (
    <>
      <div className="encabezado">
        <div><h2>Gestionar libros</h2><p>Fichas bibliográficas, estado de los ejemplares e inventario.</p></div>
        <div className="acciones"><button className="boton" onClick={() => setModal("compra")}>Solicitar compra</button><button className="boton primario" onClick={() => setModal("nueva")}>Nueva ficha</button></div>
      </div>
      <div className="pestanas" role="tablist">
        <button role="tab" aria-selected={pestana === "libros"} onClick={() => setPestana("libros")}>Libros</button>
        <button role="tab" aria-selected={pestana === "compras"} onClick={() => setPestana("compras")}>Solicitudes de compra</button>
      </div>
      <Aviso mensaje={mensaje ?? libros.error} alCerrar={() => setMensaje(null)} />
      {pestana === "libros" ? (
        <>
          <div className="panel filtros" role="search" aria-label="Filtros del listado de libros">
            <label className="campo"><span>Título, autor o ISBN</span><input value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} /></label>
            <Selector etiqueta="Tema" opciones={catalogos.datos?.temas ?? []} todos="Todos" valor={filtro.tema} alCambiar={(tema) => setFiltro({ ...filtro, tema })} />
            <Selector etiqueta="Estado de ejemplares" opciones={ESTADOS} todos="Todos" valor={filtro.estado} alCambiar={(estado) => setFiltro({ ...filtro, estado })} />
            <Selector etiqueta="Tipo de uso" opciones={TIPOS_USO} todos="Todos" valor={filtro.tipoUso} alCambiar={(tipoUso) => setFiltro({ ...filtro, tipoUso })} />
            <Selector etiqueta="Piso" opciones={catalogos.datos?.pisos ?? []} todos="Todos" valor={filtro.piso} alCambiar={(piso) => setFiltro({ ...filtro, piso })} />
          </div>
          <Tabla titulo="Listado de libros" columnas={["Libro", "Tema", "Uso", "Inventario", "Precio USD", ""]} vacio="No hay libros con esos filtros." cantidad={lista.length}>
            {lista.map((l) => (
              <tr key={l.id}>
                <td><b>{l.titulo}</b><small>{l.autores} · ISBN {l.isbn}</small></td>
                <td>{l.tema}</td>
                <td>{l.tipoUso}</td>
                <td><small>{l.disponibles} disponibles · {l.prestados} prestados · {l.fueraDeServicio} fuera de servicio · {l.total} total</small></td>
                <td>{l.precioUsd.toFixed(2)}</td>
                <td><button className="boton chico" onClick={() => void abrirFicha(l.id)} aria-label={`Abrir ficha de ${l.titulo}`}>Ficha</button></td>
              </tr>
            ))}
          </Tabla>
        </>
      ) : (
        <Tabla titulo="Solicitudes de compra" columnas={["Libro", "Cantidad", "Justificación", "Solicitó", "Estatus", ""]} vacio="No hay solicitudes de compra." cantidad={solicitudes.datos?.length ?? 0}>
          {(solicitudes.datos ?? []).map((s) => (
            <tr key={s.id}>
              <td><b>{s.titulo}</b><small>{s.autor}</small></td><td>{s.cantidad}</td><td>{s.justificacion}</td><td>{s.solicitante}<small>{fecha(s.fecha)}</small></td>
              <td><Etiqueta color={s.estatus === "Aprobada" ? "verde" : s.estatus === "Rechazada" ? "rojo" : "naranja"}>{s.estatus}</Etiqueta></td>
              <td>{sesion.rol === "Administrador" && s.estatus === "Pendiente" && <div className="acciones"><button className="boton chico" onClick={() => void decidir(s.id, "Aprobada")}>Aprobar</button><button className="boton chico peligro" onClick={() => void decidir(s.id, "Rechazada")}>Rechazar</button></div>}</td>
            </tr>
          ))}
        </Tabla>
      )}

      {modal === "nueva" && (
        <Modal titulo="Nueva ficha bibliográfica" alCerrar={() => setModal(null)}>
          <form onSubmit={(e) => void crear(e)}>
            <CamposFicha />
            <Campo etiqueta="Número de ejemplares" nombre="ejemplares" tipo="number" min={1} max={200} requerido valorInicial={1} />
            <CamposUbicacion />
            <div className="acciones"><button type="button" className="boton" onClick={() => setModal(null)}>Cancelar</button><button className="boton primario">Guardar ficha</button></div>
          </form>
        </Modal>
      )}
      {modal === "ficha" && fichaAbierta && (
        <Modal titulo={`Ficha: ${fichaAbierta.titulo}`} alCerrar={() => setModal(null)}>
          <form onSubmit={(e) => void actualizar(e)} key={fichaAbierta.isbn + fichaAbierta.titulo}>
            <CamposFicha ficha={fichaAbierta} />
            <div className="acciones"><button type="button" className="boton peligro" onClick={() => void eliminar()}>Eliminar ficha</button><button className="boton primario">Guardar cambios</button></div>
          </form>
          <h3>Ejemplares</h3>
          <Tabla titulo="Estado y ubicación de cada ejemplar" columnas={["Clave", "Ubicación", "Estado"]} vacio="Sin ejemplares." cantidad={fichaAbierta.ejemplares.length}>
            {fichaAbierta.ejemplares.map((ej) => (
              <tr key={ej.id}>
                <td>{ej.clave}</td><td>{ej.piso} · {ej.area} · {ej.pasillo}-{ej.estante}</td>
                <td>{ej.estado === "Prestado" ? <Etiqueta color="azul">Prestado</Etiqueta> : (
                  <select aria-label={`Estado del ejemplar ${ej.clave}`} value={ej.estado} onChange={(e) => void cambiarEstado(ej, e.target.value)}>
                    {ESTADOS.filter((s) => s !== "Prestado").map((s) => <option key={s}>{s}</option>)}
                  </select>)}
                </td>
              </tr>
            ))}
          </Tabla>
          <form onSubmit={(e) => void agregarEjemplares(e)}>
            <h3>Agregar ejemplares</h3>
            <Campo etiqueta="Cantidad" nombre="cantidad" tipo="number" min={1} max={200} requerido valorInicial={1} />
            <CamposUbicacion />
            <div className="acciones"><button className="boton">Agregar</button></div>
          </form>
        </Modal>
      )}
      {modal === "compra" && (
        <Modal titulo="Solicitud de compra de libros" alCerrar={() => setModal(null)}>
          <form onSubmit={(e) => void solicitarCompra(e)}>
            <Campo etiqueta="Título" nombre="titulo" requerido /><Campo etiqueta="Autor" nombre="autor" requerido />
            <div className="rejilla"><Campo etiqueta="ISBN (opcional)" nombre="isbn" /><Campo etiqueta="Cantidad" nombre="cantidad" tipo="number" min={1} max={100} requerido valorInicial={1} /></div>
            <Campo etiqueta="Justificación" nombre="justificacion" requerido ayuda="Por qué se necesita (demanda, materia, reposición)." />
            <div className="acciones"><button type="button" className="boton" onClick={() => setModal(null)}>Cancelar</button><button className="boton primario">Enviar solicitud</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
