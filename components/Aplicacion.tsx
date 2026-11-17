"use client";
/**
 * Estructura de la aplicación web: inicio de sesión, menú por rol (Propuesta
 * 3.3: menús por rol, navegación en máximo 3 clics) y controles de accesibilidad
 * (tamaño de letra y alto contraste).
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, permisosDe, type Permiso, type Sesion } from "../lib/api";
import { Chatbot } from "./Chatbot";
import { Aviso, Campo, mensajeDeError, type Mensaje } from "./ui";
import { Busqueda } from "./vistas/Busqueda";
import { Catalogo } from "./vistas/Catalogo";
import { Inicio } from "./vistas/Inicio";
import { MiCuenta } from "./vistas/MiCuenta";
import { Multas } from "./vistas/Multas";
import { Perfiles } from "./vistas/Perfiles";
import { Prestamos } from "./vistas/Prestamos";
import { Suspensiones } from "./vistas/Suspensiones";
import { Usuarios } from "./vistas/Usuarios";

export type Vista = "inicio" | "usuarios" | "perfiles" | "catalogo" | "busqueda" | "prestamos" | "multas" | "suspensiones" | "cuenta";

/** Menú por perfil (HU6-SP0): cada opción aparece si el perfil tiene alguno de sus permisos. */
const MENU: Array<{ vista: Vista; etiqueta: string; permisos: Permiso[] | "todos" }> = [
  { vista: "inicio", etiqueta: "Inicio", permisos: ["prestamos", "devoluciones", "multas", "suspensiones", "gestionar-libros"] },
  { vista: "prestamos", etiqueta: "Prestar y devolver", permisos: ["prestamos", "devoluciones"] },
  { vista: "multas", etiqueta: "Multas y adeudos", permisos: ["multas"] },
  { vista: "suspensiones", etiqueta: "Alumnos suspendidos", permisos: ["suspensiones"] },
  { vista: "catalogo", etiqueta: "Gestionar libros", permisos: ["gestionar-libros", "compras"] },
  { vista: "busqueda", etiqueta: "Buscar libros", permisos: ["buscar-libros"] },
  { vista: "usuarios", etiqueta: "Gestión de usuarios", permisos: ["cuentas"] },
  { vista: "perfiles", etiqueta: "Gestión de perfiles", permisos: ["perfiles"] },
  { vista: "cuenta", etiqueta: "Mi cuenta", permisos: "todos" },
];
const VISTAS = MENU.map((m) => m.vista);
const permitida = (s: Sesion, v: Vista) => { const m = MENU.find((x) => x.vista === v); return !!m && (m.permisos === "todos" || m.permisos.some((p) => permisosDe(s).includes(p))); };
const vistaDeDireccion = (): Vista | null => { const v = window.location.hash.replace(/^#\/?/, "") as Vista; return VISTAS.includes(v) ? v : null; };

function preferencia(clave: string): string | null {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function guardarPreferencia(clave: string, valor: string) {
  try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: solo dura la sesión */ }
}

function ControlesAccesibilidad() {
  const [escala, setEscala] = useState(1);
  const [alto, setAlto] = useState(false);
  useEffect(() => { setEscala(Number(preferencia("sigeb-escala") ?? 1)); setAlto(preferencia("sigeb-contraste") === "alto"); }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--escala", String(escala));
    document.documentElement.dataset.contraste = alto ? "alto" : "normal";
    guardarPreferencia("sigeb-escala", String(escala)); guardarPreferencia("sigeb-contraste", alto ? "alto" : "normal");
  }, [escala, alto]);
  return (
    <div className="acciones-barra" role="group" aria-label="Accesibilidad">
      {/* El nombre accesible empieza con el texto visible (WCAG 2.5.3, control por voz). */}
      <button className="boton chico" onClick={() => setEscala((e) => Math.max(0.875, +(e - 0.125).toFixed(3)))} aria-label="A− Reducir tamaño de letra" title="Reducir tamaño de letra">A−</button>
      <button className="boton chico" onClick={() => setEscala((e) => Math.min(1.75, +(e + 0.125).toFixed(3)))} aria-label="A+ Aumentar tamaño de letra" title="Aumentar tamaño de letra">A+</button>
      <button className="boton chico" aria-pressed={alto} onClick={() => setAlto((a) => !a)}>Alto contraste</button>
    </div>
  );
}

function InicioSesion({ alEntrar }: { alEntrar: (s: Sesion, bienvenida: string) => void }) {
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [enviando, setEnviando] = useState(false);
  const entrar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const d = new FormData(e.currentTarget);
    setEnviando(true);
    try {
      const r = await api<{ sesion: Sesion; mensaje: string }>("/api/auth/sesion", { metodo: "POST", cuerpo: { identificador: d.get("identificador"), contrasena: d.get("contrasena") } });
      alEntrar(r.sesion, r.mensaje);
    } catch (err) { setMensaje(mensajeDeError(err)); setEnviando(false); }
  };
  return (
    <main className="pantalla-sesion">
      <div className="tarjeta-sesion">
        <ControlesAccesibilidad />
        <h1>SIGEB</h1>
        <p>Biblioteca · Universidad Ducky</p>
        <form onSubmit={(e) => void entrar(e)}>
          <Campo etiqueta="Usuario, matrícula o nómina" nombre="identificador" requerido autoFoco />
          <Campo etiqueta="Contraseña" nombre="contrasena" tipo="password" requerido />
          <Aviso mensaje={mensaje} />
          <button className="boton primario" style={{ width: "100%" }} disabled={enviando}>{enviando ? "Entrando…" : "Iniciar sesión"}</button>
        </form>
      </div>
    </main>
  );
}

export function Aplicacion() {
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);
  const [vista, setVista] = useState<Vista>("inicio");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const botonMenu = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  const cerrarMenu = () => { setMenuAbierto(false); botonMenu.current?.focus(); };

  // Menú del celular: el foco entra al abrir, Escape lo cierra y el foco vuelve al botón (WCAG 2.1.1 y 2.4.3).
  useEffect(() => {
    if (!menuAbierto) return;
    menu.current?.querySelector<HTMLElement>(".menu button")?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrarMenu(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [menuAbierto]);

  const [bienvenida, setBienvenida] = useState<Mensaje>(null);
  useEffect(() => { void api<{ sesion: Sesion | null }>("/api/auth/sesion").then((r) => entrar(r.sesion)).catch(() => setSesion(null)); }, []);
  // Cada función tiene su dirección (#usuarios, #catalogo…): se puede abrir desde un enlace.
  useEffect(() => {
    const cambio = () => { const v = vistaDeDireccion(); if (v) setVista(v); };
    window.addEventListener("hashchange", cambio);
    return () => window.removeEventListener("hashchange", cambio);
  }, []);
  const entrar = (s: Sesion | null, saludo?: string) => {
    setSesion(s);
    if (!s) return;
    if (saludo) setBienvenida({ tipo: "exito", texto: saludo });
    setVista(vistaDeDireccion() ?? (permitida(s, "inicio") ? "inicio" : "busqueda"));
  };
  const salir = async () => { await api("/api/auth/sesion", { metodo: "DELETE" }).catch(() => undefined); setSesion(null); setBienvenida(null); };
  const ir = (v: Vista) => { setVista(v); setMenuAbierto(false); setBienvenida(null); if (window.location.hash !== `#${v}`) window.history.pushState(null, "", `#${v}`); document.getElementById("contenido")?.focus(); };

  if (sesion === undefined) return <p className="vacio" role="status">Comprobando sesión…</p>;
  if (!sesion) return <InicioSesion alEntrar={entrar} />;
  const opciones = MENU.filter((m) => permitida(sesion, m.vista));
  // HU1-SP0, escenario 5: abrir una función fuera del perfil desde una dirección directa.
  const denegada = !permitida(sesion, vista);
  // HU2-SP0, escenario 4: el personal sin el permiso de cuentas que abre la Gestión de usuarios.
  const mensajeDenegada = vista === "usuarios" && permitida(sesion, "inicio") ? "Solo el administrador puede dar de alta cuentas." : "No tienes permisos para acceder a esta función.";
  const titulo = MENU.find((o) => o.vista === vista)?.etiqueta ?? "";

  return (
    <div className="estructura">
      <a className="saltar" href="#contenido">Saltar al contenido</a>
      <div className="fondo-menu" data-abierto={menuAbierto} aria-hidden="true" onClick={cerrarMenu} />
      <nav id="menu-principal" ref={menu} className="lateral" aria-label="Menú principal" data-abierto={menuAbierto}>
        <div className="marca"><div className="marca-logo" aria-hidden="true">📚</div><div><strong>SIGEB</strong><span>Biblioteca · Universidad Ducky</span></div>
          <button type="button" className="boton chico cerrar-menu" onClick={cerrarMenu} aria-label="Cerrar menú">×</button></div>
        <ul className="menu">
          {opciones.map((o) => <li key={o.vista}><button aria-current={vista === o.vista ? "page" : undefined} onClick={() => ir(o.vista)}>{o.etiqueta}</button></li>)}
        </ul>
        <div className="usuario-actual"><strong>{sesion.nombre}</strong><span>{sesion.perfil && sesion.perfil !== sesion.rol ? `${sesion.rol} (perfil ${sesion.perfil})` : sesion.rol} · {sesion.identificador}</span></div>
      </nav>
      {/* Con el menú del celular abierto, la página de atrás no recibe foco ni clics */}
      <div className="principal" {...(menuAbierto ? ({ inert: "" } as Record<string, string>) : {})}>
        <header className="barra">
          <button ref={botonMenu} className="boton boton-menu" aria-expanded={menuAbierto} aria-controls="menu-principal" onClick={() => setMenuAbierto(true)}>☰ Menú</button>
          <h1>{titulo}</h1>
          <div className="acciones-barra"><ControlesAccesibilidad /><button className="boton chico" onClick={() => void salir()}>Cerrar sesión</button></div>
        </header>
        <main id="contenido" className="contenido" tabIndex={-1}>
          <Aviso mensaje={bienvenida} alCerrar={() => setBienvenida(null)} />
          {denegada ? <Aviso mensaje={{ tipo: "error", texto: mensajeDenegada }} /> : (
            <>
              {vista === "inicio" && <Inicio sesion={sesion} ir={ir} />}
              {vista === "prestamos" && <Prestamos />}
              {vista === "multas" && <Multas sesion={sesion} />}
              {vista === "suspensiones" && <Suspensiones />}
              {vista === "catalogo" && <Catalogo sesion={sesion} />}
              {vista === "busqueda" && <Busqueda />}
              {vista === "usuarios" && <Usuarios sesion={sesion} />}
              {vista === "perfiles" && <Perfiles />}
              {vista === "cuenta" && <MiCuenta />}
            </>
          )}
        </main>
      </div>
      <Chatbot />
    </div>
  );
}
