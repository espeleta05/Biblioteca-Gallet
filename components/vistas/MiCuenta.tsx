"use client";
/**
 * Mi cuenta: datos, perfil, préstamos activos y multas pendientes de quien inició
 * sesión (HU2-SP0: "consultar sus préstamos"). Solo el administrador cambia los
 * datos de una cuenta (HU4-SP0, escenario 4).
 */
import { useState } from "react";
import { api, fecha, pesos } from "../../lib/api";
import { Aviso, Etiqueta, mensajeDeError, Tabla, useDatos, type Mensaje } from "../ui";

type Cuenta = {
  identificador: string; nombre: string; rol: string; perfil: string; estatus: string; correo: string; telefono: string | null;
  prestamos: Array<{ titulo: string; ejemplar: string; fechaPrestamo: string; fechaVencimiento: string; vencido: boolean }>;
  multas: Array<{ motivo: string; montoMxn: number; fecha: string }>;
};

export function MiCuenta() {
  const cuenta = useDatos(() => api<Cuenta>("/api/auth/cuenta"), []);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const editar = async () => {
    try { await api("/api/auth/cuenta", { metodo: "PATCH", cuerpo: {} }); } catch (e) { setMensaje(mensajeDeError(e)); }
  };
  const c = cuenta.datos;
  return (
    <>
      <Aviso mensaje={mensaje ?? cuenta.error} alCerrar={() => setMensaje(null)} />
      {c && (
        <>
          <section className="panel" aria-labelledby="mis-datos">
            <div className="encabezado"><h2 id="mis-datos">Mis datos</h2><div className="acciones"><button className="boton" onClick={() => void editar()}>Editar mis datos</button></div></div>
            <dl className="datos">
              <div><dt>Nombre</dt><dd>{c.nombre}</dd></div>
              <div><dt>Matrícula o nómina</dt><dd>{c.identificador}</dd></div>
              <div><dt>Tipo de cuenta y perfil</dt><dd>{c.rol} · {c.perfil}</dd></div>
              <div><dt>Correo</dt><dd>{c.correo}</dd></div>
              <div><dt>Teléfono</dt><dd>{c.telefono ?? "—"}</dd></div>
            </dl>
          </section>
          <Tabla titulo="Mis préstamos" columnas={["Libro", "Prestado", "Vence"]} vacio="No tienes préstamos activos." cantidad={c.prestamos.length}>
            {c.prestamos.map((p) => (
              <tr key={p.ejemplar}><td><b>{p.titulo}</b><small>Ejemplar {p.ejemplar}</small></td><td>{fecha(p.fechaPrestamo)}</td>
                <td>{fecha(p.fechaVencimiento)}{p.vencido && <> <Etiqueta color="rojo">Vencido</Etiqueta></>}</td></tr>
            ))}
          </Tabla>
          <Tabla titulo="Mis multas pendientes" columnas={["Motivo", "Fecha", "Monto"]} vacio="No tienes multas pendientes." cantidad={c.multas.length}>
            {c.multas.map((m, i) => <tr key={i}><td>{m.motivo}</td><td>{fecha(m.fecha)}</td><td>{pesos(m.montoMxn)}</td></tr>)}
          </Tabla>
        </>
      )}
    </>
  );
}
