"use client";
/** Alumnos suspendidos (Sprint 3): exceso de multas, robo o mal uso; aviso a Servicios Escolares. */
import { useCallback, useState, type FormEvent } from "react";
import { api, consulta, fecha } from "../../lib/api";
import { Aviso, Campo, Etiqueta, mensajeDeError, Modal, Selector, Sugerencias, Tabla, useDatos, type Mensaje } from "../ui";

type Suspension = { id: number; persona: string; identificador: string; tipo: string; causa: string; detalle: string; origen: string; fechaInicio: string; fechaFin: string | null; estado: string; avisoServiciosEscolares: boolean };
type Persona = { idCredencial: number; nombre: string; identificador: string; rol: string };

export function Suspensiones() {
  const [estado, setEstado] = useState("Activa");
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [nueva, setNueva] = useState(false);
  const [persona, setPersona] = useState<Persona | null>(null);
  const lista = useDatos(() => api<Suspension[]>(`/api/suspensiones${consulta({ estado })}`), [estado]);
  const buscarPersonas = useCallback((q: string) => api<Persona[]>(`/api/prestamos/solicitantes${consulta({ q })}`), []);

  const suspender = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!persona) return; const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const r = await api<{ avisoServiciosEscolares: { estado: string; detalle: string } }>("/api/suspensiones", { metodo: "POST", cuerpo: { idCredencial: persona.idCredencial, causa: d.causa, detalle: d.detalle, fechaFin: d.fechaFin || undefined } });
      setNueva(false); setPersona(null); setMensaje({ tipo: "exito", texto: `Suspensión registrada. Aviso a Servicios Escolares: ${r.avisoServiciosEscolares.estado}.` }); await lista.recargar();
    } catch (err) { setMensaje(mensajeDeError(err)); }
  };
  const levantar = async (s: Suspension) => {
    if (!window.confirm(`¿Levantar la suspensión de ${s.persona}?`)) return;
    try { await api(`/api/suspensiones/${s.id}/levantamiento`, { metodo: "PATCH" }); setMensaje({ tipo: "exito", texto: "Suspensión levantada." }); await lista.recargar(); }
    catch (err) { setMensaje(mensajeDeError(err)); }
  };

  return (
    <>
      <div className="encabezado">
        <div><h2>Alumnos suspendidos</h2></div>
        <button className="boton primario" onClick={() => setNueva(true)}>Registrar suspensión</button>
      </div>
      <Aviso mensaje={mensaje ?? lista.error} alCerrar={() => setMensaje(null)} />
      <div className="filtros"><Selector etiqueta="Estado" opciones={["Activa", "Levantada"]} todos="Todas" valor={estado} alCambiar={setEstado} /></div>
      <Tabla titulo="Suspensiones" columnas={["Persona", "Causa", "Origen", "Desde", "Servicios Escolares", ""]} vacio="No hay suspensiones con ese estado." cantidad={lista.datos?.length ?? 0}>
        {(lista.datos ?? []).map((s) => (
          <tr key={s.id}>
            <td><b>{s.persona}</b><small>{s.identificador} · {s.tipo}</small></td>
            <td>{s.causa}<small>{s.detalle}</small></td>
            <td>{s.origen}</td>
            <td>{fecha(s.fechaInicio)}{s.fechaFin && <small>hasta {fecha(s.fechaFin)}</small>}</td>
            <td>{s.avisoServiciosEscolares ? <Etiqueta color="verde">Avisado</Etiqueta> : <Etiqueta color="naranja">Pendiente</Etiqueta>}</td>
            <td>{s.estado === "Activa" ? <button className="boton chico" onClick={() => void levantar(s)}>Levantar</button> : <Etiqueta color="azul">Levantada</Etiqueta>}</td>
          </tr>
        ))}
      </Tabla>
      {nueva && (
        <Modal titulo="Registrar suspensión" alCerrar={() => setNueva(false)}>
          <Sugerencias etiqueta="Alumno, profesor o colaborador" placeholder="Nombre o matrícula" buscar={buscarPersonas} mostrar={(p) => `${p.nombre} · ${p.identificador}`} alElegir={setPersona} />
          <form onSubmit={(e) => void suspender(e)}>
            <Selector etiqueta="Causa" nombre="causa" opciones={["Mal uso", "Robo", "Exceso de multas"]} valor="Mal uso" />
            <Campo etiqueta="Detalle" nombre="detalle" requerido ayuda="Describe lo ocurrido (mínimo 10 caracteres)." />
            <Campo etiqueta="Fecha de fin (opcional)" nombre="fechaFin" tipo="date" />
            <div className="acciones"><button type="button" className="boton" onClick={() => setNueva(false)}>Cancelar</button><button className="boton primario" disabled={!persona}>Suspender</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
