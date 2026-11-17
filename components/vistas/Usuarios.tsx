"use client";
/**
 * Gestión de usuarios (Sprint 0): alta, baja, cambio y consulta de cuentas
 * (HU2–HU5-SP0) y verificación contra la base de datos escolar.
 */
import { useState, type FormEvent } from "react";
import { api, consulta, fecha, TIPOS_CUENTA, type Sesion } from "../../lib/api";
import { Aviso, Campo, Etiqueta, marcarCampos, mensajeDeError, mensajeDeExito, Modal, Paginacion, Selector, Tabla, usePaginacion, type Mensaje } from "../ui";

type Usuario = {
  id: number; identificador: string; nombre: string; rol: string; perfil: string; estatus: string; correo: string; telefono: string | null;
  activoEnEscuela: boolean | null; verificadoEn: string | null; suspendido: boolean; fechaBaja: string | null; motivoBaja: string | null; bajaPor: string | null;
};
type Cambio = { campo: string; valorAnterior: string | null; valorNuevo: string | null; fecha: string; autor: string };

const datosForm = (f: HTMLFormElement) => Object.fromEntries(new FormData(f)) as Record<string, string>;
const VACIO = { q: "", rol: "", estatus: "" };

export function Usuarios({ sesion }: { sesion: Sesion }) {
  const [filtro, setFiltro] = useState(VACIO);
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [modal, setModal] = useState<{ tipo: "alta" } | { tipo: "baja"; clave: string } | { tipo: "cambio"; usuario: Usuario } | { tipo: "historial"; usuario: Usuario; cambios: Cambio[] } | null>(null);
  const paginas = usePaginacion(usuarios ?? []);
  const abrir = (m: NonNullable<typeof modal>) => { setMensaje(null); setModal(m); };

  /** Consulta de cuentas (HU5-SP0): sin dato ni filtro no se busca. */
  const buscar = async (f = filtro) => {
    if (!f.q.trim() && !f.rol && !f.estatus) { setUsuarios(null); setMensaje({ tipo: "info", texto: "Captura una clave o nombre o elige un filtro para buscar." }); return; }
    try { setUsuarios(await api<Usuario[]>(`/api/usuarios${consulta(f)}`)); setMensaje(null); } catch (e) { setMensaje(mensajeDeError(e)); }
  };
  const recargar = async () => { if (usuarios) await buscar(); };
  /** Ejecuta un formulario contra la API, marca los campos con error y muestra el mensaje del servidor. */
  const enviar = async (e: FormEvent<HTMLFormElement>, accion: (d: Record<string, string>) => Promise<unknown>, exito: string) => {
    e.preventDefault(); const formulario = e.currentTarget; marcarCampos(formulario);
    try { const r = await accion(datosForm(formulario)); setModal(null); setMensaje(mensajeDeExito(r, exito)); await recargar(); }
    catch (err) { marcarCampos(formulario, err); setMensaje(mensajeDeError(err)); }
  };
  const verHistorial = async (u: Usuario) => {
    try { abrir({ tipo: "historial", usuario: u, cambios: await api<Cambio[]>(`/api/usuarios/${u.id}/historial`) }); } catch (e) { setMensaje(mensajeDeError(e)); }
  };
  const reactivar = async (u: Usuario) => {
    try { setMensaje(mensajeDeExito(await api(`/api/usuarios/${u.id}`, { metodo: "PATCH", cuerpo: { estatus: "Activa" } }), "Cuenta reactivada.")); await recargar(); } catch (e) { setMensaje(mensajeDeError(e)); }
  };
  const sincronizar = async () => {
    try {
      const r = await api<{ consultados: number; actualizados: number; nuevos: number; marcadosInactivos: number }>("/api/usuarios/sincronizacion", { metodo: "POST" });
      setMensaje({ tipo: "exito", texto: "Usuarios verificados contra la base de datos escolar.", motivos: [`${r.consultados} consultados`, `${r.actualizados} actualizados`, `${r.nuevos} nuevos`, `${r.marcadosInactivos} ya no están activos en la escuela`] });
      await recargar();
    } catch (err) { setMensaje(mensajeDeError(err)); }
  };
  const enModal = !!modal;

  return (
    <>
      <div className="encabezado">
        <div className="acciones">
          <button className="boton" onClick={() => void sincronizar()}>Verificar con base escolar</button>
          <button className="boton" onClick={() => abrir({ tipo: "baja", clave: "" })}>Baja de cuentas</button>
          <button className="boton primario" onClick={() => abrir({ tipo: "alta" })}>Alta de cuentas</button>
        </div>
      </div>
      {!enModal && <Aviso mensaje={mensaje} alCerrar={() => setMensaje(null)} />}
      <form className="panel filtros" role="search" aria-label="Consulta de cuentas" onSubmit={(e) => { e.preventDefault(); void buscar(); }}>
        <label className="campo ancho"><span>Clave, nombre o correo</span><input name="q" value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} /></label>
        <Selector etiqueta="Tipo de cuenta" opciones={TIPOS_CUENTA} todos="Todos" valor={filtro.rol} alCambiar={(rol) => setFiltro({ ...filtro, rol })} />
        <Selector etiqueta="Estatus" opciones={["Activa", "Inactiva"]} todos="Todos" valor={filtro.estatus} alCambiar={(estatus) => setFiltro({ ...filtro, estatus })} />
        <button className="boton primario" type="submit">Consultar cuentas</button>
      </form>
      {usuarios && (
        <Tabla titulo="Cuentas" columnas={["Cuenta", "Tipo y perfil", "Estatus", "Base escolar", "Acciones"]} vacio="No se encontraron cuentas con ese dato." cantidad={usuarios.length} pie={<Paginacion {...paginas} />}>
          {paginas.visibles.map((u) => (
            <tr key={u.id}>
              <td><b>{u.nombre}</b><small>{u.identificador} · {u.correo}{u.telefono && ` · ${u.telefono}`}</small></td>
              <td>{u.rol}<small>Perfil: {u.perfil}</small></td>
              <td>
                <Etiqueta color={u.estatus === "Activa" ? "verde" : "rojo"}>{u.estatus}</Etiqueta> {u.suspendido && <Etiqueta color="naranja">Suspendido</Etiqueta>}
                {u.fechaBaja && <small>Baja {fecha(u.fechaBaja)} por {u.bajaPor}: {u.motivoBaja}</small>}
              </td>
              <td>{u.activoEnEscuela === null ? "—" : u.activoEnEscuela ? <Etiqueta color="verde">Activo</Etiqueta> : <Etiqueta color="rojo">Baja</Etiqueta>}{u.verificadoEn && <small>Verificado {fecha(u.verificadoEn)}</small>}</td>
              <td>
                <div className="acciones">
                  <button className="boton chico" onClick={() => abrir({ tipo: "cambio", usuario: u })} aria-label={`Cambiar datos de ${u.identificador}`}>Cambiar datos</button>
                  {u.estatus === "Activa"
                    ? u.id !== sesion.id && <button className="boton chico peligro" onClick={() => abrir({ tipo: "baja", clave: u.identificador })} aria-label={`Dar de baja a ${u.identificador}`}>Dar de baja</button>
                    : <button className="boton chico" onClick={() => void reactivar(u)} aria-label={`Reactivar a ${u.identificador}`}>Reactivar</button>}
                  <button className="boton chico" onClick={() => void verHistorial(u)} aria-label={`Historial de ${u.identificador}`}>Historial</button>
                </div>
              </td>
            </tr>
          ))}
        </Tabla>
      )}

      {modal?.tipo === "alta" && (
        <Modal titulo="Alta de cuentas" alCerrar={() => setModal(null)}>
          <Aviso mensaje={mensaje} />
          <form noValidate onSubmit={(e) => void enviar(e, (d) => api("/api/usuarios", { metodo: "POST", cuerpo: { nombre: d.nombre, identificador: d.identificador, correo: d.correo, telefono: d.telefono || undefined, rol: d.rol, contrasena: d.contrasena } }), "Cuenta creada.")}>
            <Campo etiqueta="Nombre completo" nombre="nombre" requerido />
            <div className="rejilla">
              <Campo etiqueta="Matrícula o nómina" nombre="identificador" requerido ayuda="Letras, números y guiones." />
              <Selector etiqueta="Tipo de cuenta" nombre="rol" opciones={TIPOS_CUENTA} todos="Elige…" valor="" />
              <Campo etiqueta="Correo" nombre="correo" tipo="email" requerido />
              <Campo etiqueta="Teléfono (10 dígitos)" nombre="telefono" tipo="tel" />
            </div>
            <Campo etiqueta="Contraseña temporal" nombre="contrasena" tipo="password" requerido ayuda="Mínimo 8 caracteres. Se le envía por correo." />
            <div className="acciones"><button type="button" className="boton" onClick={() => setModal(null)}>Cancelar</button><button className="boton primario">Crear cuenta</button></div>
          </form>
        </Modal>
      )}
      {modal?.tipo === "baja" && (
        <Modal titulo="Baja de cuentas" alCerrar={() => setModal(null)}>
          <Aviso mensaje={mensaje} />
          <form noValidate onSubmit={(e) => void enviar(e, (d) => api("/api/usuarios/bajas", { metodo: "POST", cuerpo: { identificador: d.identificador, motivo: d.motivo } }), "Cuenta dada de baja.")}>
            <Campo etiqueta="Clave de la cuenta (matrícula o nómina)" nombre="identificador" requerido valorInicial={modal.clave} />
            <Campo etiqueta="Motivo de la baja" nombre="motivo" requerido ayuda="Por ejemplo: egresó, cambio de institución, término de contrato." />
            <p><small>Solo se da de baja si no tiene préstamos vigentes ni multas pendientes. Sus sesiones abiertas se cierran.</small></p>
            <div className="acciones"><button type="button" className="boton" onClick={() => setModal(null)}>Cancelar</button><button className="boton peligro">Dar de baja</button></div>
          </form>
        </Modal>
      )}
      {modal?.tipo === "cambio" && (
        <Modal titulo={`Cambio de datos: ${modal.usuario.identificador}`} alCerrar={() => setModal(null)}>
          <Aviso mensaje={mensaje} />
          <form noValidate onSubmit={(e) => void enviar(e, (d) => {
            const u = modal.usuario;
            const cambios = { nombre: d.nombre !== u.nombre ? d.nombre : undefined, identificador: d.identificador !== u.identificador ? d.identificador : undefined,
              correo: d.correo !== u.correo ? d.correo : undefined, telefono: d.telefono && d.telefono !== (u.telefono ?? "") ? d.telefono : undefined };
            return api(`/api/usuarios/${u.id}`, { metodo: "PATCH", cuerpo: cambios });
          }, "Datos de la cuenta actualizados.")}>
            <Campo etiqueta="Nombre completo" nombre="nombre" requerido valorInicial={modal.usuario.nombre} />
            <div className="rejilla">
              <Campo etiqueta="Matrícula o nómina" nombre="identificador" requerido valorInicial={modal.usuario.identificador} />
              <Campo etiqueta="Correo" nombre="correo" tipo="email" requerido valorInicial={modal.usuario.correo} />
              <Campo etiqueta="Teléfono (10 dígitos)" nombre="telefono" tipo="tel" valorInicial={modal.usuario.telefono ?? ""} />
            </div>
            <p><small>Se guarda el dato anterior, la fecha y quién hizo el cambio.</small></p>
            <div className="acciones"><button type="button" className="boton" onClick={() => setModal(null)}>Cancelar</button><button className="boton primario">Guardar cambios</button></div>
          </form>
        </Modal>
      )}
      {modal?.tipo === "historial" && (
        <Modal titulo={`Historial de cambios: ${modal.usuario.identificador}`} alCerrar={() => setModal(null)}>
          <Tabla titulo="Cambios registrados" columnas={["Fecha", "Dato", "Antes", "Después", "Quién"]} vacio="Esta cuenta no tiene cambios registrados." cantidad={modal.cambios.length}>
            {modal.cambios.map((c, i) => <tr key={i}><td>{fecha(c.fecha)}</td><td>{c.campo}</td><td>{c.valorAnterior ?? "—"}</td><td>{c.valorNuevo ?? "—"}</td><td>{c.autor}</td></tr>)}
          </Tabla>
        </Modal>
      )}
    </>
  );
}
