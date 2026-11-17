"use client";
/**
 * Prestar y devolver libros (Sprint 2): validación del solicitante y del libro,
 * registro con recibo (correo, WhatsApp o impresión), renovación, devolución con
 * vista previa de multas y gestión de la lista de espera.
 */
import { useCallback, useState } from "react";
import { api, consulta, fecha, pesos } from "../../lib/api";
import { Aviso, Etiqueta, mensajeDeError, Modal, Selector, Sugerencias, Tabla, useDatos, type Mensaje } from "../ui";

type Solicitante = { idCredencial: number; nombre: string; identificador: string; rol: string; activo: boolean; suspendido: boolean; multasPendientes: number; prestamosActivos: number; vencimientosActivos: string[]; politica: { diasHabiles: number; maxEjemplares: number; maxRenovaciones: number } };
type LibroPrestable = { id: number; titulo: string; isbn: string; tipoUso: string; disponibles: number; enEspera: number };
type Prestamo = { id: number; titulo: string; isbn: string; ejemplar: string; solicitante: string; identificador: string; tipo: string; vencimiento: string; vencido: boolean; renovaciones: number; estado: string };
type Espera = { id: number; titulo: string; solicitante: string; identificador: string; estado: string; turno: number; fechaSolicitud: string };
type Cargo = { motivo: string; montoMxn: number };
type ResultadoPrestamo = { folio: string; vencimiento: string; ejemplar: string; ubicacion: string; contenido: string; envio: { estado: string; detalle: string; destino: string } };

const CANALES = ["Impresión", "Correo", "WhatsApp"] as const;
const CONDICIONES = ["Buen estado", "Dañado", "Perdido", "Robado"] as const;

export function Prestamos() {
  const [pestana, setPestana] = useState<"activos" | "espera">("activos");
  const [solicitante, setSolicitante] = useState<Solicitante | null>(null);
  const [libro, setLibro] = useState<LibroPrestable | null>(null);
  const [canal, setCanal] = useState<string>("Impresión");
  const [recibo, setRecibo] = useState<ResultadoPrestamo | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [busqueda, setBusqueda] = useState("");
  const [devolucion, setDevolucion] = useState<{ prestamo: Prestamo; condicion: string; cargos: Cargo[] | null } | null>(null);
  const [reinicio, setReinicio] = useState(0);
  const activos = useDatos(() => api<Prestamo[]>(`/api/prestamos${consulta({ estado: "Activo", q: busqueda })}`), [busqueda, reinicio]);
  const espera = useDatos(() => api<Espera[]>("/api/lista-espera"), [reinicio]);

  const buscarSolicitantes = useCallback((q: string) => api<Solicitante[]>(`/api/prestamos/solicitantes${consulta({ q })}`), []);
  const buscarLibros = useCallback((q: string) => api<LibroPrestable[]>(`/api/prestamos/libros${consulta({ q })}`), []);
  const refrescar = () => setReinicio((n) => n + 1);

  const prestar = async () => {
    if (!solicitante || !libro) return;
    try {
      const r = await api<ResultadoPrestamo>("/api/prestamos", { metodo: "POST", cuerpo: { idSolicitante: solicitante.idCredencial, idLibro: libro.id, canalRecibo: canal } });
      setRecibo(r); setMensaje({ tipo: "exito", texto: `Préstamo ${r.folio} registrado. Vence el ${fecha(r.vencimiento)}.` });
      setSolicitante(null); setLibro(null); refrescar();
    } catch (e) { setMensaje(mensajeDeError(e)); }
  };
  const ponerEnEspera = async () => {
    if (!solicitante || !libro) return;
    try { await api("/api/lista-espera", { metodo: "POST", cuerpo: { idSolicitante: solicitante.idCredencial, idLibro: libro.id } }); setMensaje({ tipo: "exito", texto: `${solicitante.nombre} quedó en la lista de espera de "${libro.titulo}".` }); refrescar(); }
    catch (e) { setMensaje(mensajeDeError(e)); }
  };
  const renovar = async (p: Prestamo) => {
    try { const r = await api<{ vencimiento: string; renovacion: number; maximo: number }>(`/api/prestamos/${p.id}/renovaciones`, { metodo: "POST" }); setMensaje({ tipo: "exito", texto: `Renovación ${r.renovacion} de ${r.maximo}: "${p.titulo}" ahora vence el ${fecha(r.vencimiento)}.` }); refrescar(); }
    catch (e) { setMensaje(mensajeDeError(e)); }
  };
  const vistaPrevia = async (prestamo: Prestamo, condicion: string) => {
    setDevolucion({ prestamo, condicion, cargos: null });
    try { const r = await api<{ cargos: Cargo[] }>(`/api/devoluciones/${prestamo.id}/vista-previa${consulta({ condicion })}`); setDevolucion({ prestamo, condicion, cargos: r.cargos }); }
    catch (e) { setMensaje(mensajeDeError(e)); setDevolucion(null); }
  };
  const devolver = async () => {
    if (!devolucion) return;
    try {
      const r = await api<{ total: number; seguimiento: Record<string, string> }>("/api/devoluciones", { metodo: "POST", cuerpo: { idPrestamo: devolucion.prestamo.id, condicion: devolucion.condicion } });
      setMensaje({ tipo: r.total > 0 ? "info" : "exito", texto: r.total > 0 ? `Devolución registrada con multa(s) por ${pesos(r.total)}.` : "Devolución registrada sin multa.", motivos: Object.values(r.seguimiento) });
      setDevolucion(null); refrescar();
    } catch (e) { setMensaje(mensajeDeError(e)); }
  };
  const cancelarEspera = async (id: number) => {
    try { await api(`/api/lista-espera/${id}/cancelacion`, { metodo: "PATCH" }); refrescar(); } catch (e) { setMensaje(mensajeDeError(e)); }
  };

  const alertasSolicitante = solicitante ? [
    !solicitante.activo && "Cuenta inactiva", solicitante.suspendido && "Suspendido",
    solicitante.multasPendientes > 0 && `${solicitante.multasPendientes} multa(s) pendiente(s)`,
    solicitante.prestamosActivos >= solicitante.politica.maxEjemplares && `Ya tiene ${solicitante.prestamosActivos} de ${solicitante.politica.maxEjemplares} ejemplares`,
  ].filter(Boolean) as string[] : [];

  return (
    <>
      <div className="encabezado"><div><h2>Prestar y devolver libros</h2></div></div>
      <Aviso mensaje={mensaje} alCerrar={() => setMensaje(null)} />
      <section className="panel" aria-labelledby="titulo-prestamo">
        <h2 id="titulo-prestamo">Registrar préstamo</h2>
        <div className="rejilla">
          <div>
            <Sugerencias etiqueta="Solicitante (nombre o matrícula)" placeholder="Ej. ALU001" buscar={buscarSolicitantes} mostrar={(s) => `${s.nombre} · ${s.identificador}`} alElegir={setSolicitante} />
            {solicitante && (
              <div className="ficha-situacion" aria-live="polite">
                <b>{solicitante.nombre}</b> ({solicitante.rol}) · {solicitante.prestamosActivos}/{solicitante.politica.maxEjemplares} ejemplares · {solicitante.politica.diasHabiles} días hábiles · {solicitante.politica.maxRenovaciones} renovaciones
                <div>{alertasSolicitante.length ? alertasSolicitante.map((a) => <Etiqueta key={a} color="rojo">{a}</Etiqueta>) : <Etiqueta color="verde">Sin impedimentos</Etiqueta>}</div>
              </div>
            )}
          </div>
          <div>
            <Sugerencias etiqueta="Libro (título o ISBN)" placeholder="Ej. Clean Code" buscar={buscarLibros} mostrar={(l) => `${l.titulo} · ${l.disponibles} disp.`} alElegir={setLibro} />
            {libro && (
              <div className="ficha-situacion" aria-live="polite">
                <b>{libro.titulo}</b> · {libro.tipoUso} · {libro.disponibles} disponible(s){libro.enEspera > 0 && ` · ${libro.enEspera} en espera`}
              </div>
            )}
          </div>
          <Selector etiqueta="Entregar recibo por" opciones={CANALES} valor={canal} alCambiar={setCanal} />
        </div>
        <div className="acciones">
          {libro && libro.disponibles === 0 && <button className="boton" disabled={!solicitante} onClick={() => void ponerEnEspera()}>Agregar a lista de espera</button>}
          <button className="boton primario" disabled={!solicitante || !libro} onClick={() => void prestar()}>Registrar préstamo</button>
        </div>
      </section>

      <div className="pestanas" role="tablist">
        <button role="tab" aria-selected={pestana === "activos"} onClick={() => setPestana("activos")}>Préstamos activos</button>
        <button role="tab" aria-selected={pestana === "espera"} onClick={() => setPestana("espera")}>Lista de espera ({espera.datos?.length ?? 0})</button>
      </div>
      {pestana === "activos" ? (
        <>
          <div className="filtros"><label className="campo"><span>Buscar préstamo (persona, matrícula, libro o ISBN)</span><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></label></div>
          <Tabla titulo="Préstamos activos" columnas={["Solicitante", "Libro", "Vence", "Renovaciones", "Acciones"]} vacio="No hay préstamos activos." cantidad={activos.datos?.length ?? 0}>
            {(activos.datos ?? []).map((p) => (
              <tr key={p.id}>
                <td><b>{p.solicitante}</b><small>{p.identificador} · {p.tipo}</small></td>
                <td><b>{p.titulo}</b><small>Ejemplar {p.ejemplar}</small></td>
                <td>{fecha(p.vencimiento)} {p.vencido && <Etiqueta color="rojo">Vencido</Etiqueta>}</td>
                <td>{p.renovaciones}</td>
                <td><div className="acciones">
                  <button className="boton chico" onClick={() => void renovar(p)} aria-label={`Renovar ${p.titulo} de ${p.solicitante}`}>Renovar</button>
                  <button className="boton chico primario" onClick={() => void vistaPrevia(p, "Buen estado")} aria-label={`Devolver ${p.titulo} de ${p.solicitante}`}>Devolver</button>
                </div></td>
              </tr>
            ))}
          </Tabla>
        </>
      ) : (
        <Tabla titulo="Lista de espera" columnas={["Libro", "Turno", "Persona", "Estado", ""]} vacio="Nadie está en lista de espera." cantidad={espera.datos?.length ?? 0}>
          {(espera.datos ?? []).map((w) => (
            <tr key={w.id}>
              <td>{w.titulo}</td><td>{w.turno}</td><td><b>{w.solicitante}</b><small>{w.identificador} · desde {fecha(w.fechaSolicitud)}</small></td>
              <td><Etiqueta color={w.estado === "Notificado" ? "verde" : "naranja"}>{w.estado}</Etiqueta></td>
              <td><button className="boton chico peligro" onClick={() => void cancelarEspera(w.id)}>Cancelar</button></td>
            </tr>
          ))}
        </Tabla>
      )}

      {devolucion && (
        <Modal titulo={`Devolver "${devolucion.prestamo.titulo}"`} alCerrar={() => setDevolucion(null)}>
          <p>{devolucion.prestamo.solicitante} · vence {fecha(devolucion.prestamo.vencimiento)}</p>
          <Selector etiqueta="Condición del libro" opciones={CONDICIONES} valor={devolucion.condicion} alCambiar={(c) => void vistaPrevia(devolucion.prestamo, c)} />
          <div aria-live="polite">
            {devolucion.cargos === null ? <p>Calculando multas…</p> : devolucion.cargos.length === 0 ? <Aviso mensaje={{ tipo: "exito", texto: "No se genera multa." }} /> : (
              <Aviso mensaje={{ tipo: "info", texto: `Se generará(n) multa(s) por ${pesos(devolucion.cargos.reduce((s, c) => s + c.montoMxn, 0))}`, motivos: devolucion.cargos.map((c) => `${c.motivo}: ${pesos(c.montoMxn)}`) }} />
            )}
          </div>
          <div className="acciones"><button className="boton" onClick={() => setDevolucion(null)}>Cancelar</button><button className="boton primario" disabled={devolucion.cargos === null} onClick={() => void devolver()}>Confirmar devolución</button></div>
        </Modal>
      )}
      {recibo && (
        <Modal titulo={`Recibo ${recibo.folio}`} alCerrar={() => setRecibo(null)}>
          <pre className="recibo">{recibo.contenido}</pre>
          <p>Ubicación del ejemplar: {recibo.ubicacion}</p>
          <Aviso mensaje={{ tipo: recibo.envio.estado === "Fallido" ? "error" : "info", texto: `Envío: ${recibo.envio.estado} (${recibo.envio.destino})`, motivos: [recibo.envio.detalle] }} />
          <div className="acciones"><a className="boton primario" href={`/recibos/${recibo.folio}`} target="_blank" rel="noreferrer">Imprimir recibo</a></div>
        </Modal>
      )}
    </>
  );
}
