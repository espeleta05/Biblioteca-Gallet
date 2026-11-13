"use client";
/** Componentes de interfaz reutilizables y accesibles (etiquetas, roles ARIA, foco). */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ErrorApi } from "../lib/api";

export type Mensaje = { tipo: "exito" | "error" | "info"; texto: string; motivos?: string[] } | null;

export function mensajeDeError(error: unknown): Mensaje {
  if (error instanceof ErrorApi) return { tipo: "error", texto: error.message, motivos: error.motivos };
  return { tipo: "error", texto: error instanceof Error ? error.message : "Ocurrió un error inesperado." };
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

type PropsCampo = { etiqueta: string; nombre: string; tipo?: string; requerido?: boolean; valorInicial?: string | number; ayuda?: string; min?: number; max?: number; paso?: string; patron?: string; autoFoco?: boolean };
export function Campo({ etiqueta, nombre, tipo = "text", requerido, valorInicial, ayuda, min, max, paso, patron, autoFoco }: PropsCampo) {
  const id = useId();
  return (
    <label className="campo" htmlFor={id}>
      <span>{etiqueta}{requerido && <abbr title="obligatorio" aria-hidden="true"> *</abbr>}</span>
      <input id={id} name={nombre} type={tipo} required={requerido} defaultValue={valorInicial} min={min} max={max} step={paso} pattern={patron} autoFocus={autoFoco} aria-describedby={ayuda ? `${id}-ayuda` : undefined} />
      {ayuda && <small id={`${id}-ayuda`}>{ayuda}</small>}
    </label>
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

export function Tabla({ titulo, columnas, vacio, children, cantidad }: { titulo: string; columnas: string[]; vacio: string; children: ReactNode; cantidad: number }) {
  return (
    <div className="tabla">
      <table>
        <caption>{titulo} <span className="solo-lectores">({cantidad} registros)</span></caption>
        <thead><tr>{columnas.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      {cantidad === 0 && <p className="vacio">{vacio}</p>}
    </div>
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
