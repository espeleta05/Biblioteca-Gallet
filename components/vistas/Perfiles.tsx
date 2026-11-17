"use client";
/** Gestión de perfiles (HU6-SP0): crear, asignar y eliminar perfiles con los permisos de cada cuenta. */
import { useState, type FormEvent } from "react";
import { api, PERMISOS, type Permiso } from "../../lib/api";
import { Aviso, Campo, Etiqueta, GrupoCasillas, marcarCampos, mensajeDeError, mensajeDeExito, Modal, Tabla, useDatos, type Mensaje } from "../ui";

type Perfil = { id: number; nombre: string; permisos: Permiso[]; esBase: boolean; cuentas: number };
const OPCIONES = (Object.keys(PERMISOS) as Permiso[]).map((p) => ({ valor: p, texto: PERMISOS[p] }));

export function Perfiles() {
  const perfiles = useDatos(() => api<Perfil[]>("/api/perfiles"), []);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [modal, setModal] = useState<"nuevo" | "asignar" | null>(null);
  const abrir = (m: "nuevo" | "asignar") => { setMensaje(null); setModal(m); };

  const enviar = async (e: FormEvent<HTMLFormElement>, accion: (f: FormData) => Promise<unknown>, exito: string) => {
    e.preventDefault(); const formulario = e.currentTarget; marcarCampos(formulario);
    try { const r = await accion(new FormData(formulario)); setModal(null); setMensaje(mensajeDeExito(r, exito)); await perfiles.recargar(); }
    catch (err) { marcarCampos(formulario, err); setMensaje(mensajeDeError(err)); }
  };
  const eliminar = async (p: Perfil) => {
    if (!window.confirm(`¿Eliminar el perfil ${p.nombre}?`)) return;
    try { setMensaje(mensajeDeExito(await api(`/api/perfiles/${p.id}`, { metodo: "DELETE" }), "Perfil eliminado.")); await perfiles.recargar(); }
    catch (err) { setMensaje(mensajeDeError(err)); }
  };
  const lista = perfiles.datos ?? [];

  return (
    <>
      <div className="encabezado">
        <div className="acciones">
          <button className="boton" onClick={() => abrir("asignar")}>Asignar perfil</button>
          <button className="boton primario" onClick={() => abrir("nuevo")}>Nuevo perfil</button>
        </div>
      </div>
      {!modal && <Aviso mensaje={mensaje ?? perfiles.error} alCerrar={() => setMensaje(null)} />}
      <Tabla titulo="Perfiles" columnas={["Perfil", "Permisos", "Cuentas", "Acciones"]} vacio="No hay perfiles." cantidad={lista.length}>
        {lista.map((p) => (
          <tr key={p.id}>
            <td><b>{p.nombre}</b>{p.esBase && <small>Perfil base del tipo de cuenta</small>}</td>
            <td><small>{p.permisos.map((x) => PERMISOS[x] ?? x).join(" · ")}</small></td>
            <td>{p.cuentas}</td>
            <td>{p.esBase ? <Etiqueta color="azul">Base</Etiqueta> : <button className="boton chico peligro" onClick={() => void eliminar(p)} aria-label={`Eliminar el perfil ${p.nombre}`}>Eliminar</button>}</td>
          </tr>
        ))}
      </Tabla>

      {modal === "nuevo" && (
        <Modal titulo="Nuevo perfil" alCerrar={() => setModal(null)}>
          <Aviso mensaje={mensaje} />
          <form noValidate onSubmit={(e) => void enviar(e, (f) => api("/api/perfiles", { metodo: "POST", cuerpo: { nombre: f.get("nombre"), permisos: f.getAll("permisos") } }), "Perfil creado.")}>
            <Campo etiqueta="Nombre del perfil" nombre="nombre" requerido />
            <GrupoCasillas leyenda="Permisos (funciones que podrá usar)" nombre="permisos" opciones={OPCIONES} />
            <div className="acciones"><button type="button" className="boton" onClick={() => setModal(null)}>Cancelar</button><button className="boton primario">Crear perfil</button></div>
          </form>
        </Modal>
      )}
      {modal === "asignar" && (
        <Modal titulo="Asignar perfil" alCerrar={() => setModal(null)}>
          <Aviso mensaje={mensaje} />
          <form noValidate onSubmit={(e) => void enviar(e, (f) => api("/api/perfiles/asignaciones", { metodo: "POST", cuerpo: { identificador: f.get("identificador"), idPerfil: Number(f.get("idPerfil")) } }), "Perfil asignado.")}>
            <Campo etiqueta="Clave de la cuenta (matrícula o nómina)" nombre="identificador" requerido />
            <label className="campo"><span>Perfil</span>
              <select name="idPerfil">{lista.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
            </label>
            <p><small>Los permisos nuevos aplican desde el siguiente inicio de sesión de la cuenta.</small></p>
            <div className="acciones"><button type="button" className="boton" onClick={() => setModal(null)}>Cancelar</button><button className="boton primario">Asignar</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
