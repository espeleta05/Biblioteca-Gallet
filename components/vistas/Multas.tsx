"use client";
/**
 * Gestión de multas (Sprint 3): validar fechas de préstamos, multas, pagos
 * confirmados por Tesorería con recibo, revocación, lista de personas con
 * adeudos (exportable) y avisos de adeudo.
 */
import { useState, type FormEvent } from "react";
import { api, consulta, fecha, pesos, type Sesion } from "../../lib/api";
import { Aviso, Campo, Etiqueta, mensajeDeError, Modal, Selector, Tabla, useDatos, type Mensaje } from "../ui";

type Multa = { id: number; motivo: string; montoMxn: number; diasRetraso: number | null; tipoCambio: number | null; estatus: string; fecha: string; persona: string; identificador: string; titulo: string; folioRecibo: string | null; motivoRevocacion: string | null };
type Vencido = { id: number; persona: string; identificador: string; titulo: string; vencimiento: string; diasRetraso: number; multaAcumuladaMxn: number };
type Deudor = { identificador: string; persona: string; tipo: string; correo: string; telefono: string; multas: number; totalMxn: number; desde: string; suspendido: boolean };

function exportarCsv(deudores: Deudor[]) {
  const filas = [["Matrícula/Nómina", "Nombre", "Tipo", "Correo", "Teléfono", "Multas", "Total MXN", "Suspendido"], ...deudores.map((d) => [d.identificador, d.persona, d.tipo, d.correo, d.telefono, d.multas, d.totalMxn, d.suspendido ? "Sí" : "No"])];
  const csv = "﻿" + filas.map((f) => f.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  enlace.download = `personas-con-adeudos-${new Date().toISOString().slice(0, 10)}.csv`;
  enlace.click();
}

export function Multas({ sesion }: { sesion: Sesion }) {
  const [pestana, setPestana] = useState<"multas" | "vencidos" | "adeudos">("multas");
  const [filtro, setFiltro] = useState({ estatus: "Pendiente", q: "" });
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [pago, setPago] = useState<Multa | null>(null);
  const [revocacion, setRevocacion] = useState<Multa | null>(null);
  const [recibo, setRecibo] = useState<string | null>(null);
  const multas = useDatos(() => api<Multa[]>(`/api/multas${consulta(filtro)}`), [filtro]);
  const vencidos = useDatos(() => api<Vencido[]>("/api/multas/prestamos-vencidos"), [pestana]);
  const adeudos = useDatos(() => api<Deudor[]>("/api/adeudos"), [pestana]);
  const tipoCambio = useDatos(() => api<{ fecha: string; valor: number; fuente: string; aviso?: string }>("/api/tipo-cambio"), []);

  const pagar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!pago) return; const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const r = await api<{ folio: string; contenido: string; envio: { estado: string } }>(`/api/multas/${pago.id}/pagos`, { metodo: "POST", cuerpo: { referenciaTesoreria: d.referencia.trim(), montoMxn: Number(d.monto), canalRecibo: d.canal } });
      setPago(null); setRecibo(r.contenido); setMensaje({ tipo: "exito", texto: `Pago registrado. Recibo ${r.folio} (${r.envio.estado}).` }); await multas.recargar();
    } catch (err) { setMensaje(mensajeDeError(err)); }
  };
  const revocar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!revocacion) return; const motivo = String(new FormData(e.currentTarget).get("motivo"));
    try { await api(`/api/multas/${revocacion.id}/revocacion`, { metodo: "POST", cuerpo: { motivo } }); setRevocacion(null); setMensaje({ tipo: "exito", texto: "Multa revocada." }); await multas.recargar(); }
    catch (err) { setMensaje(mensajeDeError(err)); }
  };
  const avisar = async (canal: "Correo" | "WhatsApp") => {
    try { const r = await api<{ enviados: number; resultados: Array<{ persona: string; estado: string }> }>("/api/adeudos/avisos", { metodo: "POST", cuerpo: { canal } }); setMensaje({ tipo: "info", texto: `${r.enviados} aviso(s) de adeudo por ${canal}.`, motivos: r.resultados.map((x) => `${x.persona}: ${x.estado}`) }); }
    catch (err) { setMensaje(mensajeDeError(err)); }
  };

  return (
    <>
      <div className="encabezado">
        <div><h2>Gestión de multas</h2><p>Multa por retraso: $10 por día (Regla 3). Reposición: precio USD × tipo de cambio Banxico (Regla 4).</p></div>
        {tipoCambio.datos && <p><Etiqueta color="azul">Tipo de cambio: {tipoCambio.datos.valor.toFixed(4)} MXN/USD · {fecha(tipoCambio.datos.fecha)}</Etiqueta>{tipoCambio.datos.aviso && <small> {tipoCambio.datos.aviso}</small>}</p>}
      </div>
      <Aviso mensaje={mensaje} alCerrar={() => setMensaje(null)} />
      <div className="pestanas" role="tablist">
        <button role="tab" aria-selected={pestana === "multas"} onClick={() => setPestana("multas")}>Multas</button>
        <button role="tab" aria-selected={pestana === "vencidos"} onClick={() => setPestana("vencidos")}>Préstamos vencidos</button>
        <button role="tab" aria-selected={pestana === "adeudos"} onClick={() => setPestana("adeudos")}>Personas con adeudos</button>
      </div>

      {pestana === "multas" && (
        <>
          <div className="filtros">
            <Selector etiqueta="Estatus" opciones={["Pendiente", "Pagada", "Revocada"]} todos="Todos" valor={filtro.estatus} alCambiar={(estatus) => setFiltro({ ...filtro, estatus })} />
            <label className="campo"><span>Persona, matrícula o libro</span><input value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} /></label>
          </div>
          <Tabla titulo="Multas" columnas={["Persona", "Libro", "Motivo", "Monto", "Estatus", "Acciones"]} vacio="No hay multas con esos filtros." cantidad={multas.datos?.length ?? 0}>
            {(multas.datos ?? []).map((m) => (
              <tr key={m.id}>
                <td><b>{m.persona}</b><small>{m.identificador} · {fecha(m.fecha)}</small></td>
                <td>{m.titulo}</td>
                <td>{m.motivo}<small>{m.diasRetraso ? `${m.diasRetraso} día(s) de retraso` : m.tipoCambio ? `T.C. ${m.tipoCambio}` : ""}</small></td>
                <td>{pesos(m.montoMxn)}</td>
                <td><Etiqueta color={m.estatus === "Pagada" ? "verde" : m.estatus === "Revocada" ? "azul" : "naranja"}>{m.estatus}</Etiqueta>{m.folioRecibo && <small>Recibo {m.folioRecibo}</small>}{m.motivoRevocacion && <small>{m.motivoRevocacion}</small>}</td>
                <td>{m.estatus === "Pendiente" && <div className="acciones">
                  <button className="boton chico primario" onClick={() => setPago(m)}>Registrar pago</button>
                  {sesion.rol === "Administrador" && <button className="boton chico peligro" onClick={() => setRevocacion(m)}>Revocar</button>}
                </div>}</td>
              </tr>
            ))}
          </Tabla>
        </>
      )}
      {pestana === "vencidos" && (
        <Tabla titulo="Préstamos vencidos (validación de fechas)" columnas={["Persona", "Libro", "Venció", "Días de retraso", "Multa acumulada"]} vacio="No hay préstamos vencidos." cantidad={vencidos.datos?.length ?? 0}>
          {(vencidos.datos ?? []).map((v) => <tr key={v.id}><td><b>{v.persona}</b><small>{v.identificador}</small></td><td>{v.titulo}</td><td>{fecha(v.vencimiento)}</td><td>{v.diasRetraso}</td><td>{pesos(v.multaAcumuladaMxn)}</td></tr>)}
        </Tabla>
      )}
      {pestana === "adeudos" && (
        <>
          <div className="acciones no-imprimir" style={{ justifyContent: "flex-start", marginBottom: "1rem" }}>
            <button className="boton" onClick={() => exportarCsv(adeudos.datos ?? [])}>Exportar lista (CSV)</button>
            <button className="boton" onClick={() => window.print()}>Imprimir lista</button>
            <button className="boton" onClick={() => void avisar("Correo")}>Enviar avisos por correo</button>
            <button className="boton" onClick={() => void avisar("WhatsApp")}>Enviar avisos por WhatsApp</button>
          </div>
          <Tabla titulo="Personas con adeudos" columnas={["Persona", "Tipo", "Contacto", "Multas", "Total", "Desde"]} vacio="Nadie tiene adeudos." cantidad={adeudos.datos?.length ?? 0}>
            {(adeudos.datos ?? []).map((d) => <tr key={d.identificador}><td><b>{d.persona}</b><small>{d.identificador} {d.suspendido && "· suspendido"}</small></td><td>{d.tipo}</td><td><small>{d.correo}</small><small>{d.telefono}</small></td><td>{d.multas}</td><td>{pesos(d.totalMxn)}</td><td>{fecha(d.desde)}</td></tr>)}
          </Tabla>
        </>
      )}

      {pago && (
        <Modal titulo={`Registrar pago · ${pago.persona}`} alCerrar={() => setPago(null)}>
          <p>Multa #{pago.id} por {pago.motivo.toLowerCase()}: <b>{pesos(pago.montoMxn)}</b>. Tesorería confirma la referencia antes de liquidar.</p>
          <form onSubmit={(e) => void pagar(e)}>
            <Campo etiqueta="Referencia de pago de Tesorería" nombre="referencia" requerido ayuda="Formato del recibo de Tesorería, p. ej. TES-000123." />
            <Campo etiqueta="Monto pagado (MXN)" nombre="monto" tipo="number" paso="0.01" min={0.01} requerido valorInicial={pago.montoMxn} />
            <Selector etiqueta="Entregar recibo por" nombre="canal" opciones={["Impresión", "Correo", "WhatsApp"]} valor="Impresión" />
            <div className="acciones"><button type="button" className="boton" onClick={() => setPago(null)}>Cancelar</button><button className="boton primario">Registrar pago</button></div>
          </form>
        </Modal>
      )}
      {revocacion && (
        <Modal titulo={`Revocar multa #${revocacion.id}`} alCerrar={() => setRevocacion(null)}>
          <form onSubmit={(e) => void revocar(e)}>
            <Campo etiqueta="Motivo de la revocación" nombre="motivo" requerido ayuda="Queda registrado como evidencia (mínimo 10 caracteres)." />
            <div className="acciones"><button type="button" className="boton" onClick={() => setRevocacion(null)}>Cancelar</button><button className="boton peligro">Revocar multa</button></div>
          </form>
        </Modal>
      )}
      {recibo && (
        <Modal titulo="Recibo de pago" alCerrar={() => setRecibo(null)}>
          <pre className="recibo">{recibo}</pre>
          <div className="acciones"><button className="boton primario" onClick={() => window.print()}>Imprimir</button></div>
        </Modal>
      )}
    </>
  );
}
