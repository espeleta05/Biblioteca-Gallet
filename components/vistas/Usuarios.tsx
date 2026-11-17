"use client";
/**
 * Gestión de usuarios (Sprint 0): consulta de usuarios y roles, alta de personal
 * de la biblioteca y verificación contra la base de datos escolar.
 */
import { useState, type FormEvent } from "react";
import { api, consulta, fecha, type Sesion } from "../../lib/api";
import { Aviso, Campo, Etiqueta, mensajeDeError, Modal, Paginacion, Selector, Tabla, useDatos, usePaginacion, type Mensaje } from "../ui";

type Usuario = { id: number; identificador: string; nombre: string; rol: string; estatus: string; correo: string; telefono: string | null; activoEnEscuela: boolean | null; verificadoEn: string | null; suspendido: boolean };

export function Usuarios({ sesion }: { sesion: Sesion }) {
  const [filtro, setFiltro] = useState({ q: "", rol: "" });
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [alta, setAlta] = useState(false);
  const usuarios = useDatos(() => api<Usuario[]>(`/api/usuarios${consulta(filtro)}`), [filtro]);
  const paginas = usePaginacion(usuarios.datos ?? []);

  const crear = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      await api("/api/usuarios", { metodo: "POST", cuerpo: { nombre: d.nombre, identificador: d.identificador, correo: d.correo, telefono: d.telefono || undefined, rol: d.rol, contrasena: d.contrasena } });
      setAlta(false); setMensaje({ tipo: "exito", texto: `${d.rol} ${d.nombre} dado de alta; ya puede iniciar sesión.` }); await usuarios.recargar();
    } catch (err) { setMensaje(mensajeDeError(err)); }
  };
  const cambiarEstatus = async (u: Usuario) => {
    const estatus = u.estatus === "Activa" ? "Inactiva" : "Activa";
    try { await api(`/api/usuarios/${u.id}`, { metodo: "PATCH", cuerpo: { estatus } }); await usuarios.recargar(); } catch (err) { setMensaje(mensajeDeError(err)); }
  };
  const sincronizar = async () => {
    try {
      const r = await api<{ consultados: number; actualizados: number; nuevos: number; marcadosInactivos: number }>("/api/usuarios/sincronizacion", { metodo: "POST" });
      setMensaje({ tipo: "exito", texto: "Usuarios verificados contra la base de datos escolar.", motivos: [`${r.consultados} consultados`, `${r.actualizados} actualizados`, `${r.nuevos} nuevos`, `${r.marcadosInactivos} ya no están activos en la escuela`] });
      await usuarios.recargar();
    } catch (err) { setMensaje(mensajeDeError(err)); }
  };

  return (
    <>
      <div className="encabezado">
        <div className="acciones"><button className="boton" onClick={() => void sincronizar()}>Verificar con base escolar</button><button className="boton primario" onClick={() => setAlta(true)}>Alta de personal</button></div>
      </div>
      <Aviso mensaje={mensaje ?? usuarios.error} alCerrar={() => setMensaje(null)} />
      <div className="filtros" role="search">
        <label className="campo ancho"><span>Nombre, matrícula/nómina o correo</span><input value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} /></label>
        <Selector etiqueta="Rol" opciones={["Administrador", "Bibliotecario", "Alumno", "Profesor", "Colaborador"]} todos="Todos" valor={filtro.rol} alCambiar={(rol) => setFiltro({ ...filtro, rol })} />
      </div>
      <Tabla titulo="Usuarios" columnas={["Usuario", "Rol", "Cuenta", "Base escolar", "Acciones"]} vacio="No hay usuarios con esos filtros." cantidad={usuarios.datos?.length ?? 0} pie={<Paginacion {...paginas} />}>
        {paginas.visibles.map((u) => (
          <tr key={u.id}>
            <td><b>{u.nombre}</b><small>{u.identificador} · {u.correo}{u.telefono && ` · ${u.telefono}`}</small></td>
            <td>{u.rol}</td>
            <td><Etiqueta color={u.estatus === "Activa" ? "verde" : "rojo"}>{u.estatus}</Etiqueta> {u.suspendido && <Etiqueta color="naranja">Suspendido</Etiqueta>}</td>
            <td>{u.activoEnEscuela === null ? "—" : u.activoEnEscuela ? <Etiqueta color="verde">Activo</Etiqueta> : <Etiqueta color="rojo">Baja</Etiqueta>}{u.verificadoEn && <small>Verificado {fecha(u.verificadoEn)}</small>}</td>
            <td>{u.id !== sesion.id && <button className="boton chico" onClick={() => void cambiarEstatus(u)}>{u.estatus === "Activa" ? "Desactivar" : "Activar"}</button>}</td>
          </tr>
        ))}
      </Tabla>
      {alta && (
        <Modal titulo="Alta de personal de la biblioteca" alCerrar={() => setAlta(false)}>
          <form onSubmit={(e) => void crear(e)}>
            <Campo etiqueta="Nombre completo" nombre="nombre" requerido />
            <div className="rejilla">
              <Campo etiqueta="Nómina" nombre="identificador" requerido ayuda="Letras, números y guiones." />
              <Campo etiqueta="Correo institucional" nombre="correo" tipo="email" requerido />
              <Campo etiqueta="Teléfono (10 dígitos)" nombre="telefono" tipo="tel" patron="\d{10}" />
              <Selector etiqueta="Rol" nombre="rol" opciones={["Bibliotecario", "Administrador"]} valor="Bibliotecario" />
            </div>
            <Campo etiqueta="Contraseña inicial" nombre="contrasena" tipo="password" requerido ayuda="Mínimo 8 caracteres." />
            <div className="acciones"><button type="button" className="boton" onClick={() => setAlta(false)}>Cancelar</button><button className="boton primario">Dar de alta</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
