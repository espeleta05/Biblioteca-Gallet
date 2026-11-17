"use client";
/** Componentes de interfaz reutilizables y accesibles (etiquetas, roles ARIA, foco). */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ErrorApi } from "../lib/api";

export type Mensaje = { tipo: "exito" | "error" | "info"; texto: string; motivos?: string[] } | null;

export function mensajeDeError(error: unknown): Mensaje {
  if (error instanceof ErrorApi) return { tipo: "error", texto: error.message, motivos: error.motivos };
  return { tipo: "error", texto: error instanceof Error ? error.message : "Ocurrió un error inesperado." };
}

/** Mensaje de éxito con el texto que devolvió el servidor ("Cuenta creada con clave…"). */
export function mensajeDeExito(respuesta: unknown, otro: string): Mensaje {
  const r = respuesta as { mensaje?: string; motivos?: string[] } | null;
  return { tipo: "exito", texto: r?.mensaje ?? otro, motivos: r?.motivos };
}

/**
 * Marca con aria-invalid los campos que el servidor rechazó ("Revisa los campos
 * marcados…") y lleva el foco al primero (WCAG 3.3.1). Sin error, limpia las marcas.
 */
export function marcarCampos(formulario: HTMLFormElement | null, error?: unknown) {
  if (!formulario) return;
  formulario.querySelectorAll("[aria-invalid]").forEach((c) => c.removeAttribute("aria-invalid"));
  const campos = error instanceof ErrorApi ? error.campos : [];
  const elementos = campos.map((c) => formulario.querySelector<HTMLElement>(`[name="${c}"]`)).filter((e): e is HTMLElement => !!e);
  elementos.forEach((e) => e.setAttribute("aria-invalid", "true"));
  elementos[0]?.focus();
}

export function Aviso({ mensaje, alCerrar }: { mensaje: Mensaje; alCerrar?: () => void }) {
  if (!mensaje) return null;
  return (
    <div className={`aviso ${mensaje.tipo}`} role={mensaje.tipo === "error" ? "alert" : "status"}>
      <div>
        <strong>{mensaje.texto}</strong>
        {mensaje.motivos && mensaje.motivos.length > 0 && <ul>{mensaje.motivos.map((m) => <li key={m}>{m}</li>)}</ul>}
      </div>
      {alCerrar && <button type="button" onClick={alCerrar} aria-label="Cerrar mensaje">×</button>}
    </div>
  );
}

type PropsCampo = { etiqueta: string; nombre: string; tipo?: string; requerido?: boolean; valorInicial?: string | number; ayuda?: string; min?: number; max?: number; paso?: string; patron?: string; autoFoco?: boolean; sugerencias?: readonly string[] };
export function Campo({ etiqueta, nombre, tipo = "text", requerido, valorInicial, ayuda, min, max, paso, patron, autoFoco, sugerencias }: PropsCampo) {
  const id = useId();
  return (
    <label className="campo" htmlFor={id}>
      <span>{etiqueta}{requerido && <abbr title="obligatorio" aria-hidden="true"> *</abbr>}</span>
      <input id={id} name={nombre} type={tipo} required={requerido} defaultValue={valorInicial} min={min} max={max} step={paso} pattern={patron} autoFocus={autoFoco}
        aria-describedby={ayuda ? `${id}-ayuda` : undefined} list={sugerencias?.length ? `${id}-lista` : undefined} autoComplete={sugerencias ? "off" : undefined} />
      {sugerencias && sugerencias.length > 0 && <datalist id={`${id}-lista`}>{sugerencias.map((s) => <option key={s} value={s} />)}</datalist>}
      {ayuda && <small id={`${id}-ayuda`}>{ayuda}</small>}
    </label>
  );
}

/** Grupo de casillas con leyenda (p. ej. los permisos de un perfil). */
export function GrupoCasillas({ leyenda, nombre, opciones }: { leyenda: string; nombre: string; opciones: Array<{ valor: string; texto: string }> }) {
  return (
    <fieldset className="grupo-casillas" name={nombre}>
      <legend>{leyenda}</legend>
      {opciones.map((o) => (
        <label key={o.valor} className="casilla"><input type="checkbox" name={nombre} value={o.valor} /><span>{o.texto}</span></label>
      ))}
    </fieldset>
  );
}

export function Selector({ etiqueta, nombre, opciones, valor, alCambiar, requerido, todos }: { etiqueta: string; nombre?: string; opciones: readonly string[]; valor?: string; alCambiar?: (v: string) => void; requerido?: boolean; todos?: string }) {
  const id = useId();
  return (
    <label className="campo" htmlFor={id}>
      <span>{etiqueta}</span>
      <select id={id} name={nombre} required={requerido} value={alCambiar ? valor ?? "" : undefined} defaultValue={alCambiar ? undefined : valor} onChange={alCambiar ? (e) => alCambiar(e.target.value) : undefined}>
        {todos && <option value="">{todos}</option>}
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

/** Diálogo modal: atrapa el foco al abrir, cierra con Escape y devuelve el foco. */
export function Modal({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") alCerrar(); };
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("keydown", tecla); anterior?.focus(); };
  }, [alCerrar]);
  return (
    <div className="fondo-modal" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div className="modal-encabezado">
          <h2 id={id}>{titulo}</h2>
          <button type="button" className="boton chico" onClick={alCerrar} aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Etiqueta({ color, children }: { color: "verde" | "naranja" | "rojo" | "azul"; children: ReactNode }) {
  return <span className={`etiqueta ${color}`}>{children}</span>;
}

export function Tabla({ titulo, columnas, vacio, children, cantidad, pie }: { titulo: string; columnas: string[]; vacio: string; children: ReactNode; cantidad: number; pie?: ReactNode }) {
  return (
    // Focusable para poder desplazar con teclado cuando la tabla no cabe (WCAG 2.1.1).
    <div className="tabla" tabIndex={0} role="region" aria-label={titulo}>
      <table>
        <caption>{titulo} <span className="solo-lectores">({cantidad} registros)</span></caption>
        <thead><tr>{columnas.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      {cantidad === 0 && <p className="vacio">{vacio}</p>}
      {pie}
    </div>
  );
}

/** Casilla de verificación con su etiqueta al lado, del tamaño de un control táctil. */
export function Casilla({ etiqueta, marcada, alCambiar }: { etiqueta: string; marcada: boolean; alCambiar: (v: boolean) => void }) {
  return (
    <label className="casilla">
      <input type="checkbox" checked={marcada} onChange={(e) => alCambiar(e.target.checked)} />
      <span>{etiqueta}</span>
    </label>
  );
}

/**
 * Pestañas con el patrón ARIA "tabs": flechas izquierda y derecha, Inicio y Fin
 * para moverse; solo la pestaña activa entra en el orden de tabulación.
 */
export function Pestanas<T extends string>({ opciones, activa, alCambiar, etiqueta, children }: { opciones: Array<{ id: T; texto: string }>; activa: T; alCambiar: (id: T) => void; etiqueta: string; children: ReactNode }) {
  const base = useId();
  const mover = (e: React.KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const destino = e.key === "ArrowRight" ? indice + 1 : e.key === "ArrowLeft" ? indice - 1 : e.key === "Home" ? 0 : e.key === "End" ? opciones.length - 1 : null;
    if (destino === null) return;
    e.preventDefault();
    const siguiente = (destino + opciones.length) % opciones.length;
    alCambiar(opciones[siguiente].id);
    document.getElementById(`${base}-${opciones[siguiente].id}`)?.focus();
  };
  return (
    <>
      <div className="pestanas" role="tablist" aria-label={etiqueta}>
        {opciones.map((o, i) => (
          <button key={o.id} id={`${base}-${o.id}`} role="tab" type="button" aria-selected={activa === o.id} aria-controls={`${base}-panel`}
            tabIndex={activa === o.id ? 0 : -1} onClick={() => alCambiar(o.id)} onKeyDown={(e) => mover(e, i)}>{o.texto}</button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-${activa}`}>{children}</div>
    </>
  );
}

/** Divide una lista larga en páginas para no obligar a desplazarse por cientos de filas. */
export function usePaginacion<T>(lista: T[], porPagina = 20) {
  const [pagina, setPagina] = useState(1);
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  useEffect(() => { if (pagina > paginas) setPagina(1); }, [pagina, paginas]);
  const actual = Math.min(pagina, paginas);
  return { visibles: lista.slice((actual - 1) * porPagina, actual * porPagina), pagina: actual, paginas, total: lista.length, porPagina, setPagina };
}

export function Paginacion({ pagina, paginas, total, porPagina, setPagina }: { pagina: number; paginas: number; total: number; porPagina: number; setPagina: (p: number) => void }) {
  if (total <= porPagina) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, pagina * porPagina);
  return (
    <nav className="paginacion" aria-label="Paginación">
      <span role="status">{desde}–{hasta} de {total}</span>
      <div className="acciones">
        <button type="button" className="boton chico" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
        <span>Página {pagina} de {paginas}</span>
        <button type="button" className="boton chico" disabled={pagina === paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
      </div>
    </nav>
  );
}

/** Carga datos de la API y expone estado de carga y error. */
export function useDatos<T>(cargar: () => Promise<T>, dependencias: unknown[]) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<Mensaje>(null);
  const [cargando, setCargando] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recargar = useCallback(async () => {
    setCargando(true);
    try { setDatos(await cargar()); setError(null); } catch (e) { setError(mensajeDeError(e)); } finally { setCargando(false); }
  }, dependencias);
  useEffect(() => { void recargar(); }, [recargar]);
  return { datos, error, cargando, recargar };
}

/** Campo con sugerencias mientras se escribe (búsqueda de solicitantes y libros). */
export function Sugerencias<T>({ etiqueta, buscar, mostrar, alElegir, placeholder }: { etiqueta: string; buscar: (texto: string) => Promise<T[]>; mostrar: (item: T) => string; alElegir: (item: T) => void; placeholder: string }) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [opciones, setOpciones] = useState<T[]>([]);
  const elegido = useRef(false);
  useEffect(() => {
    if (elegido.current || texto.trim().length < 2) { elegido.current = false; setOpciones([]); return; }
    const t = setTimeout(() => { void buscar(texto).then(setOpciones).catch(() => setOpciones([])); }, 250);
    return () => clearTimeout(t);
  }, [texto, buscar]);
  return (
    <div className="sugerencias">
      <label className="campo" htmlFor={id}>
        <span>{etiqueta}</span>
        <input id={id} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={opciones.length > 0} aria-controls={`${id}-lista`} />
      </label>
      {opciones.length > 0 && (
        <ul id={`${id}-lista`} role="listbox" aria-label={`Resultados para ${etiqueta}`}>
          {opciones.map((o, i) => <li key={i} role="option" aria-selected="false"><button type="button" onClick={() => { elegido.current = true; alElegir(o); setTexto(mostrar(o)); setOpciones([]); }}>{mostrar(o)}</button></li>)}
        </ul>
      )}
    </div>
  );
}
