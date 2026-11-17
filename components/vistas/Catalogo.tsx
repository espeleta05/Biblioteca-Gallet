"use client";
/**
 * Gestionar libros (Sprint 1): alta, baja, cambio y consulta de libros (HU1–HU4-SP1),
 * listado por filtros para inventario (HU6-SP1), compra de libros (HU5-SP1),
 * solicitudes de compra y ubicaciones de la Biblioteca.
 */
import { useState, type FormEvent } from "react";
import { api, consulta, fecha, puede, type Sesion } from "../../lib/api";
import { Aviso, Campo, Etiqueta, marcarCampos, mensajeDeError, mensajeDeExito, Modal, Paginacion, Pestanas, Selector, Tabla, useDatos, usePaginacion, type Mensaje } from "../ui";
import { Compras } from "./Compras";
import { Inventario, Ubicaciones, type Catalogos } from "./Inventario";

const TIPOS_USO = ["Préstamo externo", "Consulta interna", "Reservado"] as const;
const ESTADOS = ["Disponible", "Prestado", "Perdido", "Robado", "Dañado", "Dado de baja"] as const;
const MOTIVOS_BAJA = ["Perdido", "Dañado", "Robado", "Obsoleto"] as const;

type Libro = { id: number; clave: string; isbn: string; titulo: string; autores: string; editorial: string; tema: string; tipoUso: string; precioUsd: number; total: number; disponibles: number; prestados: number; fueraDeServicio: number; dadosDeBaja: number };
type Ejemplar = { id: number; clave: string; estado: string; piso: string | null; area: string | null; pasillo: string | null; estante: string | null; motivoBaja: string | null };
type Ficha = Omit<Libro, "autores"> & { autores: string[]; edicion: number | null; anioPublicacion: number | null; paginas: number | null; ejemplares: Ejemplar[]; sinCopias: boolean; proximaDevolucion: string | null };
type Solicitud = { id: number; titulo: string; autor: string; isbn: string | null; cantidad: number; justificacion: string; estatus: string; fecha: string; solicitante: string };
type Cambio = { campo: string; valorAnterior: string | null; valorNuevo: string | null; fecha: string; autor: string };
type Pestana = "libros" | "inventario" | "compras" | "solicitudes" | "ubicaciones";

const datosForm = (f: HTMLFormElement) => Object.fromEntries(new FormData(f)) as Record<string, string>;
const numero = (v: string | undefined) => (v ? Number(v) : undefined);
const ubicacionDe = (d: Record<string, string>) => ({ piso: d.piso, area: d.area, pasillo: d.pasillo, estante: d.estante });
export const textoUbicacion = (e: { piso: string | null; area: string | null; pasillo: string | null; estante: string | null }) =>
  e.piso ? `${e.piso} · ${e.area} · pasillo ${e.pasillo} · estante ${e.estante}` : null;

function fichaDesdeFormulario(d: Record<string, string>) {
  return {
    isbn: d.isbn, titulo: d.titulo, autores: d.autores.split(";").map((a) => a.trim()).filter(Boolean), editorial: d.editorial, tema: d.tema,
    edicion: numero(d.edicion), anioPublicacion: numero(d.anioPublicacion), paginas: numero(d.paginas), tipoUso: d.tipoUso, precioUsd: d.precioUsd === "" ? undefined : Number(d.precioUsd),
  };
}

function CamposFicha({ ficha, catalogos }: { ficha?: Ficha; catalogos: Catalogos | null }) {
  return (
    <>
      <div className="rejilla">
        <Campo etiqueta="ISBN" nombre="isbn" requerido valorInicial={ficha?.isbn} ayuda="10 o 13 dígitos; se valida el dígito verificador." />
        <Campo etiqueta="Título" nombre="titulo" requerido valorInicial={ficha?.titulo} />
      </div>
      <Campo etiqueta="Autores" nombre="autores" requerido valorInicial={ficha?.autores.join("; ")} ayuda="Separa varios autores con punto y coma." />
      <div className="rejilla">
        <Campo etiqueta="Editorial" nombre="editorial" requerido valorInicial={ficha?.editorial} sugerencias={catalogos?.editoriales} />
        <Campo etiqueta="Tema" nombre="tema" requerido valorInicial={ficha?.tema} sugerencias={catalogos?.temas} />
        <Campo etiqueta="Edición" nombre="edicion" tipo="number" min={1} valorInicial={ficha?.edicion ?? undefined} />
        <Campo etiqueta="Año de publicación" nombre="anioPublicacion" tipo="number" min={1450} max={2100} valorInicial={ficha?.anioPublicacion ?? undefined} />
        <Campo etiqueta="Páginas" nombre="paginas" tipo="number" min={1} valorInicial={ficha?.paginas ?? undefined} />
        <Campo etiqueta="Precio de la última compra (USD)" nombre="precioUsd" tipo="number" min={0} paso="0.01" requerido valorInicial={ficha?.precioUsd} ayuda="Se usa para el costo de reposición (Regla 4)." />
      </div>
      <Selector etiqueta="Tipo de uso" nombre="tipoUso" opciones={TIPOS_USO} valor={ficha?.tipoUso ?? "Préstamo externo"} />
    </>
  );
}

/** Piso, área, pasillo y estante; sugiere las ubicaciones que existen en la Biblioteca. */
export function CamposUbicacion({ catalogos, requerido = true }: { catalogos: Catalogos | null; requerido?: boolean }) {
  return (
    <div className="rejilla">
      <Campo etiqueta="Piso" nombre="piso" requerido={requerido} sugerencias={catalogos?.pisos} />
      <Campo etiqueta="Área" nombre="area" requerido={requerido} sugerencias={catalogos?.areas} />
      <Campo etiqueta="Pasillo" nombre="pasillo" requerido={requerido} sugerencias={catalogos?.pasillos} />
      <Campo etiqueta="Estante" nombre="estante" requerido={requerido} sugerencias={catalogos?.estantes} />
    </div>
  );
}

export function Catalogo({ sesion }: { sesion: Sesion }) {
  const gestiona = puede(sesion, "gestionar-libros");
  const compra = puede(sesion, "compras");
  const [pestana, setPestana] = useState<Pestana>(gestiona ? "libros" : "compras");
  const [filtro, setFiltro] = useState({ q: "", tema: "", tipoUso: "", estado: "", piso: "" });
  const [modal, setModal] = useState<"alta" | "ficha" | "baja" | "solicitud" | null>(null);
  const [claveBaja, setClaveBaja] = useState("");
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [historial, setHistorial] = useState<Cambio[] | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [dato, setDato] = useState("");
  const catalogos = useDatos(() => (gestiona ? api<Catalogos>("/api/libros/catalogos") : Promise.resolve(null)), [gestiona]);
  const libros = useDatos(() => (gestiona ? api<Libro[]>(`/api/libros${consulta(filtro)}`) : Promise.resolve([])), [filtro, gestiona]);
  const solicitudes = useDatos(() => api<Solicitud[]>("/api/solicitudes-compra"), [pestana]);

  const abrir = (m: typeof modal) => { setMensaje(null); setHistorial(null); setModal(m); };
  const recargarFicha = async (id: number) => setFicha(await api<Ficha>(`/api/libros/${id}`));
  /** Envía un formulario, marca los campos que rechazó el servidor y muestra su mensaje. */
  const enviar = async (e: FormEvent<HTMLFormElement>, accion: (d: Record<string, string>) => Promise<unknown>, exito: string, despues?: () => Promise<void> | void) => {
    e.preventDefault(); const formulario = e.currentTarget; marcarCampos(formulario);
    try { const r = await accion(datosForm(formulario)); setMensaje(mensajeDeExito(r, exito)); await libros.recargar(); await despues?.(); return true; }
    catch (err) { marcarCampos(formulario, err); setMensaje(mensajeDeError(err)); return false; }
  };
  /** Consulta de libros por clave o ISBN (HU4-SP1). */
  const consultar = async (e: FormEvent) => {
    e.preventDefault();
    if (!dato.trim()) { setMensaje({ tipo: "error", texto: "Captura la clave o el ISBN del libro." }); return; }
    try { const f = await api<Ficha>(`/api/libros/consulta${consulta({ dato })}`); abrir("ficha"); setFicha(f); } catch (err) { setMensaje(mensajeDeError(err)); }
  };
  const abrirFicha = async (id: number) => {
    try { const f = await api<Ficha>(`/api/libros/${id}`); abrir("ficha"); setFicha(f); } catch (e) { setMensaje(mensajeDeError(e)); }
  };
  const cambiarEstado = async (ej: Ejemplar, estado: string) => {
    if (!ficha) return;
    try { setMensaje(mensajeDeExito(await api(`/api/libros/${ficha.id}/ejemplares/${ej.id}`, { metodo: "PATCH", cuerpo: { estado } }), `Ejemplar ${ej.clave}: ${estado}.`)); await recargarFicha(ficha.id); await libros.recargar(); }
    catch (e) { setMensaje(mensajeDeError(e)); }
  };
  const verHistorial = async () => { if (ficha) try { setHistorial(await api<Cambio[]>(`/api/libros/${ficha.id}/historial`)); } catch (e) { setMensaje(mensajeDeError(e)); } };
  const eliminar = async () => {
    if (!ficha || !window.confirm(`¿Eliminar la ficha de "${ficha.titulo}"? Solo es posible si nunca se prestó.`)) return;
    try { setMensaje(mensajeDeExito(await api(`/api/libros/${ficha.id}`, { metodo: "DELETE" }), "Ficha eliminada.")); setModal(null); await libros.recargar(); } catch (e) { setMensaje(mensajeDeError(e)); }
  };
  const decidir = async (id: number, estatus: "Aprobada" | "Rechazada") => {
    try { setMensaje(mensajeDeExito(await api(`/api/solicitudes-compra/${id}`, { metodo: "PATCH", cuerpo: { estatus } }), `Solicitud ${estatus.toLowerCase()}.`)); await solicitudes.recargar(); } catch (e) { setMensaje(mensajeDeError(e)); }
  };

  const lista = libros.datos ?? [];
  const paginas = usePaginacion(lista);
  const pestanas: Array<{ id: Pestana; texto: string }> = [
    ...(gestiona ? [{ id: "libros" as const, texto: "Libros" }, { id: "inventario" as const, texto: "Listado para inventario" }] : []),
    { id: "solicitudes", texto: "Solicitudes de compra" },
    ...(compra ? [{ id: "compras" as const, texto: "Compra de libros" }] : []),
    ...(gestiona ? [{ id: "ubicaciones" as const, texto: "Ubicaciones" }] : []),
  ];

  return (
    <>
      <div className="encabezado">
        {gestiona && (
          <form className="consulta-rapida" role="search" aria-label="Consulta de libros" onSubmit={(e) => void consultar(e)}>
            <label className="campo"><span>Consulta de libros (clave o ISBN)</span><input name="dato" value={dato} onChange={(e) => setDato(e.target.value)} placeholder="LIB-0001 o 9780134685991" /></label>
            <button className="boton">Consultar</button>
          </form>
        )}
        <div className="acciones">
          <button className="boton" onClick={() => abrir("solicitud")}>Solicitar compra</button>
          {gestiona && <button className="boton" onClick={() => { setClaveBaja(""); abrir("baja"); }}>Baja de libros</button>}
          {gestiona && <button className="boton primario" onClick={() => abrir("alta")}>Alta de libros</button>}
        </div>
      </div>
      {!modal && <Aviso mensaje={mensaje ?? libros.error} alCerrar={() => setMensaje(null)} />}
      <Pestanas etiqueta="Gestionar libros" activa={pestana} alCambiar={(p) => { setMensaje(null); setPestana(p); }} opciones={pestanas}>
        {pestana === "libros" && (
          <>
            <div className="panel filtros" role="search" aria-label="Filtros del listado de libros">
              <label className="campo ancho"><span>Título, autor, ISBN o clave</span><input value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} /></label>
              <Selector etiqueta="Tema" opciones={catalogos.datos?.temas ?? []} todos="Todos" valor={filtro.tema} alCambiar={(tema) => setFiltro({ ...filtro, tema })} />
              <Selector etiqueta="Estado de ejemplares" opciones={ESTADOS} todos="Todos" valor={filtro.estado} alCambiar={(estado) => setFiltro({ ...filtro, estado })} />
              <Selector etiqueta="Tipo de uso" opciones={TIPOS_USO} todos="Todos" valor={filtro.tipoUso} alCambiar={(tipoUso) => setFiltro({ ...filtro, tipoUso })} />
              <Selector etiqueta="Piso" opciones={catalogos.datos?.pisos ?? []} todos="Todos" valor={filtro.piso} alCambiar={(piso) => setFiltro({ ...filtro, piso })} />
            </div>
            <Tabla titulo="Listado de libros" columnas={["Libro", "Tema", "Uso", "Inventario", "Precio USD", "Acciones"]} vacio="No hay libros con esos filtros." cantidad={lista.length} pie={<Paginacion {...paginas} />}>
              {paginas.visibles.map((l) => (
                <tr key={l.id}>
                  <td><b>{l.titulo}</b><small>{l.clave} · {l.autores} · ISBN {l.isbn}</small></td>
                  <td>{l.tema}</td>
                  <td>{l.tipoUso}</td>
                  <td><small>{l.disponibles} disponibles · {l.prestados} prestados · {l.fueraDeServicio} fuera de servicio{l.dadosDeBaja > 0 && ` · ${l.dadosDeBaja} de baja`} · {l.total} activos</small></td>
                  <td>{Number(l.precioUsd).toFixed(2)}</td>
                  <td><button className="boton chico" onClick={() => void abrirFicha(l.id)} aria-label={`Abrir ficha de ${l.titulo}`}>Ficha</button></td>
                </tr>
              ))}
            </Tabla>
          </>
        )}
        {pestana === "inventario" && <Inventario catalogos={catalogos.datos} />}
        {pestana === "ubicaciones" && <Ubicaciones catalogos={catalogos.datos} alCambiar={() => void catalogos.recargar()} />}
        {pestana === "compras" && <Compras solicitudes={(solicitudes.datos ?? []).filter((s) => s.estatus === "Aprobada")} alCambiar={() => void solicitudes.recargar()} />}
        {pestana === "solicitudes" && (
          <Tabla titulo="Solicitudes de compra" columnas={["Libro", "Cantidad", "Justificación", "Solicitó", "Estatus", "Acciones"]} vacio="No hay solicitudes de compra." cantidad={solicitudes.datos?.length ?? 0}>
            {(solicitudes.datos ?? []).map((s) => (
              <tr key={s.id}>
                <td><b>{s.titulo}</b><small>{s.autor}{s.isbn && ` · ISBN ${s.isbn}`}</small></td><td>{s.cantidad}</td><td>{s.justificacion}</td><td>{s.solicitante}<small>{fecha(s.fecha)}</small></td>
                <td><Etiqueta color={s.estatus === "Rechazada" ? "rojo" : s.estatus === "Pendiente" ? "naranja" : s.estatus === "Aprobada" ? "verde" : "azul"}>{s.estatus}</Etiqueta></td>
                <td>{compra && s.estatus === "Pendiente" && <div className="acciones"><button className="boton chico" onClick={() => void decidir(s.id, "Aprobada")}>Aprobar</button><button className="boton chico peligro" onClick={() => void decidir(s.id, "Rechazada")}>Rechazar</button></div>}</td>
              </tr>
            ))}
          </Tabla>
        )}
      </Pestanas>

      {modal === "alta" && (
        <Modal titulo="Alta de libros" alCerrar={() => setModal(null)}>
          <Aviso mensaje={mensaje} />
          <form noValidate onSubmit={(e) => void enviar(e, (d) => api("/api/libros", { metodo: "POST", cuerpo: { ...fichaDesdeFormulario(d), ejemplares: Number(d.ejemplares), ubicacion: ubicacionDe(d) } }), "Libro registrado.")}>
            <CamposFicha catalogos={catalogos.datos} />
            <Campo etiqueta="Número de ejemplares" nombre="ejemplares" tipo="number" min={1} max={200} requerido valorInicial={1} />
            <h3>Ubicación física</h3>
            <CamposUbicacion catalogos={catalogos.datos} />
            <div className="acciones"><button type="button" className="boton" onClick={() => setModal(null)}>Cerrar</button><button className="boton primario">Registrar libro</button></div>
          </form>
        </Modal>
      )}
      {modal === "baja" && (
        <Modal titulo="Baja de libros" alCerrar={() => setModal(null)}>
          <Aviso mensaje={mensaje} />
          <form noValidate onSubmit={(e) => void enviar(e, (d) => api("/api/libros/ejemplares/baja", { metodo: "POST", cuerpo: { clave: d.clave, motivo: d.motivo } }), "Ejemplar dado de baja.",
            async () => { if (ficha) await recargarFicha(ficha.id); })}>
            <Campo etiqueta="Clave del ejemplar" nombre="clave" requerido valorInicial={claveBaja} ayuda="Por ejemplo EFJ-003." />
            <Selector etiqueta="Motivo de la baja" nombre="motivo" opciones={MOTIVOS_BAJA} todos="Elige…" valor="" />
            <p><small>Un ejemplar prestado o reservado no se puede dar de baja. Al dar de baja el último ejemplar, el libro deja de aparecer en las búsquedas.</small></p>
            <div className="acciones"><button type="button" className="boton" onClick={() => setModal(ficha && claveBaja ? "ficha" : null)}>Cerrar</button><button className="boton peligro">Dar de baja</button></div>
          </form>
        </Modal>
      )}
      {modal === "ficha" && ficha && (
        <Modal titulo={`Ficha: ${ficha.titulo}`} alCerrar={() => setModal(null)}>
          <Aviso mensaje={mensaje} alCerrar={() => setMensaje(null)} />
          <p><b>{ficha.clave}</b> · ISBN {ficha.isbn} · {ficha.disponibles} de {ficha.ejemplares.filter((e) => e.estado !== "Dado de baja").length} ejemplares disponibles</p>
          {ficha.sinCopias && (
            <Aviso mensaje={{ tipo: "info", texto: "Sin copias disponibles.", motivos: [
              ficha.proximaDevolucion ? `Fecha de devolución más próxima: ${fecha(ficha.proximaDevolucion)}` : "No hay préstamos activos de este libro.",
              ...(ficha.ejemplares.some((e) => e.estado === "Reservado") ? ["Hay ejemplares reservados para la primera persona de la lista de espera."] : []),
            ] }} />
          )}
          <form noValidate onSubmit={(e) => void enviar(e, (d) => api(`/api/libros/${ficha.id}`, { metodo: "PATCH", cuerpo: fichaDesdeFormulario(d) }), "Libro actualizado.", () => recargarFicha(ficha.id))} key={ficha.isbn + ficha.titulo}>
            <CamposFicha ficha={ficha} catalogos={catalogos.datos} />
            <div className="acciones"><button type="button" className="boton peligro" onClick={() => void eliminar()}>Eliminar ficha</button><button type="button" className="boton" onClick={() => void verHistorial()}>Historial de cambios</button><button className="boton primario">Guardar cambios</button></div>
          </form>
          {historial && (
            <Tabla titulo="Historial de cambios del libro" columnas={["Fecha", "Dato", "Antes", "Después", "Quién"]} vacio="Este libro no tiene cambios registrados." cantidad={historial.length}>
              {historial.map((c, i) => <tr key={i}><td>{fecha(c.fecha)}</td><td>{c.campo}</td><td>{c.valorAnterior ?? "—"}</td><td>{c.valorNuevo ?? "—"}</td><td>{c.autor}</td></tr>)}
            </Tabla>
          )}
          <h3>Ejemplares</h3>
          <Tabla titulo="Estado y ubicación de cada ejemplar" columnas={["Clave", "Ubicación", "Estado", "Acciones"]} vacio="Sin ejemplares." cantidad={ficha.ejemplares.length}>
            {ficha.ejemplares.map((ej) => (
              <tr key={ej.id}>
                <td>{ej.clave}</td>
                <td>{textoUbicacion(ej) ?? <Etiqueta color="naranja">Ubicación no disponible</Etiqueta>}</td>
                <td>{["Prestado", "Reservado", "Dado de baja"].includes(ej.estado)
                  ? <Etiqueta color={ej.estado === "Dado de baja" ? "rojo" : "azul"}>{ej.estado}{ej.motivoBaja && ` (${ej.motivoBaja})`}</Etiqueta>
                  : (
                    <select aria-label={`Estado del ejemplar ${ej.clave}`} value={ej.estado} onChange={(e) => void cambiarEstado(ej, e.target.value)}>
                      {["Disponible", "Perdido", "Robado", "Dañado"].map((s) => <option key={s}>{s}</option>)}
                    </select>)}
                </td>
                <td>{!["Prestado", "Reservado", "Dado de baja"].includes(ej.estado) && <button className="boton chico peligro" onClick={() => { setClaveBaja(ej.clave); setMensaje(null); setModal("baja"); }} aria-label={`Dar de baja el ejemplar ${ej.clave}`}>Dar de baja</button>}</td>
              </tr>
            ))}
          </Tabla>
          <form noValidate onSubmit={(e) => void enviar(e, (d) => api(`/api/libros/${ficha.id}/ubicacion`, { metodo: "PATCH", cuerpo: { ubicacion: ubicacionDe(d) } }), "Ubicación actualizada.", () => recargarFicha(ficha.id))}>
            <h3>Cambiar la ubicación del libro</h3>
            <p><small>Mueve todos sus ejemplares activos a la nueva ubicación.</small></p>
            <CamposUbicacion catalogos={catalogos.datos} />
            <div className="acciones"><button className="boton">Cambiar ubicación</button></div>
          </form>
          <form noValidate onSubmit={(e) => void enviar(e, (d) => api(`/api/libros/${ficha.id}/ejemplares`, { metodo: "POST", cuerpo: { cantidad: Number(d.cantidad), ubicacion: ubicacionDe(d) } }), "Ejemplares agregados.", () => recargarFicha(ficha.id))}>
            <h3>Agregar ejemplares</h3>
            <Campo etiqueta="Cantidad" nombre="cantidad" tipo="number" min={1} max={200} requerido valorInicial={1} />
            <CamposUbicacion catalogos={catalogos.datos} />
            <div className="acciones"><button className="boton">Agregar</button></div>
          </form>
        </Modal>
      )}
      {modal === "solicitud" && (
        <Modal titulo="Solicitud de compra de libros" alCerrar={() => setModal(null)}>
          <Aviso mensaje={mensaje} />
          <form noValidate onSubmit={(e) => void enviar(e, (d) => api("/api/solicitudes-compra", { metodo: "POST", cuerpo: { titulo: d.titulo, autor: d.autor, isbn: d.isbn || undefined, cantidad: Number(d.cantidad), justificacion: d.justificacion } }),
            "Solicitud de compra registrada.", async () => { setModal(null); await solicitudes.recargar(); })}>
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
