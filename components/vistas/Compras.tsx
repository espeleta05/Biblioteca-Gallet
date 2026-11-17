"use client";
/**
 * Compra de libros (HU5-SP1): órdenes de compra a las editoriales a partir de las
 * solicitudes aprobadas, sin pasarse del presupuesto del mes, y su recepción
 * completa o parcial.
 */
import { useState, type FormEvent } from "react";
import { api, fecha, pesos } from "../../lib/api";
import { Aviso, Campo, Etiqueta, marcarCampos, mensajeDeError, mensajeDeExito, Modal, Tabla, useDatos, type Mensaje } from "../ui";

type Solicitud = { id: number; titulo: string; autor: string; isbn: string | null; cantidad: number };
type Presupuesto = { anio: number; mes: number; montoMxn: number; comprometidoMxn: number; disponibleMxn: number; definido: boolean };
type Detalle = { id: number; titulo: string; isbn: string; cantidad: number; recibida: number; precioMxn: number };
type Orden = { id: number; folio: string; editorial: string; totalMxn: number; estatus: string; fecha: string; registro: string; libros: Detalle[] };
type Renglon = { idSolicitud: number; titulo: string; incluir: boolean; isbn: string; cantidad: string; precio: string };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function Compras({ solicitudes, alCambiar }: { solicitudes: Solicitud[]; alCambiar: () => void }) {
  const presupuesto = useDatos(() => api<Presupuesto>("/api/compras/presupuesto"), []);
  const ordenes = useDatos(() => api<Orden[]>("/api/compras"), []);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [modal, setModal] = useState<{ tipo: "orden" } | { tipo: "recepcion"; orden: Orden } | { tipo: "presupuesto" } | null>(null);
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const p = presupuesto.datos;
  const total = renglones.filter((r) => r.incluir).reduce((s, r) => s + (Number(r.cantidad) || 0) * (Number(r.precio) || 0), 0);

  const abrirOrden = () => {
    setMensaje(null);
    setRenglones(solicitudes.map((s) => ({ idSolicitud: s.id, titulo: s.titulo, incluir: true, isbn: s.isbn ?? "", cantidad: String(s.cantidad), precio: "" })));
    setModal({ tipo: "orden" });
  };
  const actualizar = (i: number, cambio: Partial<Renglon>) => setRenglones(renglones.map((r, j) => (j === i ? { ...r, ...cambio } : r)));
  const recargar = async () => { await Promise.all([presupuesto.recargar(), ordenes.recargar()]); alCambiar(); };
  const enviar = async (e: FormEvent<HTMLFormElement>, accion: (f: FormData) => Promise<unknown>, exito: string, cerrar = true) => {
    e.preventDefault(); const formulario = e.currentTarget; marcarCampos(formulario);
    try { const r = await accion(new FormData(formulario)); if (cerrar) setModal(null); setMensaje(mensajeDeExito(r, exito)); await recargar(); }
    catch (err) { marcarCampos(formulario, err); setMensaje(mensajeDeError(err)); }
  };

  return (
    <>
      {!modal && <Aviso mensaje={mensaje ?? presupuesto.error ?? ordenes.error} alCerrar={() => setMensaje(null)} />}
      <section className="tarjetas" aria-label="Presupuesto de compras del mes">
        <div className="tarjeta"><span>Presupuesto de {p ? `${MESES[p.mes - 1]} ${p.anio}` : "…"}</span><strong>{p ? pesos(p.montoMxn) : "…"}</strong>{p && !p.definido && <span>Sin definir</span>}</div>
        <div className="tarjeta"><span>Comprometido en órdenes</span><strong>{p ? pesos(p.comprometidoMxn) : "…"}</strong></div>
        <div className="tarjeta"><span>Disponible</span><strong>{p ? pesos(p.disponibleMxn) : "…"}</strong></div>
      </section>
      <div className="encabezado">
        <p>{solicitudes.length} solicitud(es) aprobada(s) esperando compra.</p>
        <div className="acciones">
          <button className="boton" onClick={() => { setMensaje(null); setModal({ tipo: "presupuesto" }); }}>Presupuesto del mes</button>
          <button className="boton primario" onClick={abrirOrden} disabled={!solicitudes.length}>Compra de libros</button>
        </div>
      </div>
      <Tabla titulo="Órdenes de compra" columnas={["Folio", "Editorial", "Libros", "Total", "Estatus", "Acciones"]} vacio="No hay órdenes de compra." cantidad={ordenes.datos?.length ?? 0}>
        {(ordenes.datos ?? []).map((o) => (
          <tr key={o.id}>
            <td><b>{o.folio}</b><small>{fecha(o.fecha)} · {o.registro}</small></td>
            <td>{o.editorial}</td>
            <td>{o.libros.map((l) => <small key={l.id}>{l.titulo}: {l.recibida}/{l.cantidad} recibidos · {pesos(l.precioMxn)} c/u</small>)}</td>
            <td>{pesos(o.totalMxn)}</td>
            <td><Etiqueta color={o.estatus === "Recibida" ? "verde" : o.estatus === "Registrada" ? "azul" : "naranja"}>{o.estatus}</Etiqueta></td>
            <td>{o.estatus !== "Recibida" && <button className="boton chico" onClick={() => { setMensaje(null); setModal({ tipo: "recepcion", orden: o }); }} aria-label={`Registrar recepción de ${o.folio}`}>Recepción</button>}</td>
          </tr>
        ))}
      </Tabla>

      {modal?.tipo === "orden" && (
        <Modal titulo="Compra de libros: nueva orden" alCerrar={() => setModal(null)}>
          <Aviso mensaje={mensaje} />
          <form noValidate onSubmit={(e) => void enviar(e, (f) => api("/api/compras", { metodo: "POST", cuerpo: {
            editorial: f.get("editorial"),
            libros: renglones.filter((r) => r.incluir).map((r) => ({ idSolicitud: r.idSolicitud, titulo: r.titulo, isbn: r.isbn, cantidad: Number(r.cantidad), precioMxn: Number(r.precio) })),
          } }), "Orden de compra registrada.")}>
            <Campo etiqueta="Editorial" nombre="editorial" requerido />
            <Tabla titulo="Libros de las solicitudes aprobadas" columnas={["Incluir", "Libro", "ISBN", "Cantidad", "Precio unitario (MXN)"]} vacio="No hay solicitudes aprobadas." cantidad={renglones.length}>
              {renglones.map((r, i) => (
                <tr key={r.idSolicitud}>
                  <td><input type="checkbox" checked={r.incluir} onChange={(e) => actualizar(i, { incluir: e.target.checked })} aria-label={`Incluir ${r.titulo}`} /></td>
                  <td>{r.titulo}</td>
                  <td><input name={`libros.${i}.isbn`} value={r.isbn} onChange={(e) => actualizar(i, { isbn: e.target.value })} aria-label={`ISBN de ${r.titulo}`} /></td>
                  <td><input name={`libros.${i}.cantidad`} type="number" min={1} value={r.cantidad} onChange={(e) => actualizar(i, { cantidad: e.target.value })} aria-label={`Cantidad de ${r.titulo}`} /></td>
                  <td><input name={`libros.${i}.precioMxn`} type="number" min={0} step="0.01" value={r.precio} onChange={(e) => actualizar(i, { precio: e.target.value })} aria-label={`Precio unitario de ${r.titulo}`} /></td>
                </tr>
              ))}
            </Tabla>
            <p role="status"><b>Total de la orden: {pesos(total)}</b> · Disponible del mes: {p ? pesos(p.disponibleMxn) : "…"}</p>
            <div className="acciones"><button type="button" className="boton" onClick={() => setModal(null)}>Cancelar</button><button className="boton primario">Registrar orden de compra</button></div>
          </form>
        </Modal>
      )}
      {modal?.tipo === "recepcion" && (
        <Modal titulo={`Recepción de compra: ${modal.orden.folio}`} alCerrar={() => setModal(null)}>
          <Aviso mensaje={mensaje} />
          <form noValidate onSubmit={(e) => void enviar(e, (f) => api(`/api/compras/${modal.orden.id}/recepcion`, { metodo: "POST", cuerpo: {
            recibidos: modal.orden.libros.filter((l) => l.recibida < l.cantidad).map((l) => ({ idDetalle: l.id, cantidad: Number(f.get(`recibido-${l.id}`) ?? 0) })),
          } }), "Compra recibida.")}>
            <p>Captura cuántos libros entregó la editorial. Si llegan todos, la orden queda como Recibida; si faltan, como Recibida parcialmente.</p>
            {modal.orden.libros.filter((l) => l.recibida < l.cantidad).map((l) => (
              <Campo key={l.id} etiqueta={`${l.titulo} (faltan ${l.cantidad - l.recibida})`} nombre={`recibido-${l.id}`} tipo="number" min={0} max={l.cantidad - l.recibida} requerido valorInicial={l.cantidad - l.recibida} />
            ))}
            <div className="acciones"><button type="button" className="boton" onClick={() => setModal(null)}>Cancelar</button><button className="boton primario">Registrar recepción</button></div>
          </form>
        </Modal>
      )}
      {modal?.tipo === "presupuesto" && (
        <Modal titulo="Presupuesto de compras del mes" alCerrar={() => setModal(null)}>
          <Aviso mensaje={mensaje} />
          <form noValidate onSubmit={(e) => void enviar(e, (f) => api("/api/compras/presupuesto", { metodo: "PATCH", cuerpo: { montoMxn: Number(f.get("montoMxn")) } }), "Presupuesto actualizado.")}>
            <Campo etiqueta="Presupuesto del mes (MXN)" nombre="montoMxn" tipo="number" min={0} paso="0.01" requerido valorInicial={p?.montoMxn} />
            <div className="acciones"><button type="button" className="boton" onClick={() => setModal(null)}>Cancelar</button><button className="boton primario">Guardar</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
