"use client";
/**
 * Estructura de la aplicación web: inicio de sesión, menú por rol (Propuesta
 * 3.3: menús por rol, navegación en máximo 3 clics) y controles de accesibilidad
 * (tamaño de letra y alto contraste).
 */
import { useEffect, useState, type FormEvent } from "react";
import { api, esPersonal, type Rol, type Sesion } from "../lib/api";
import { Chatbot } from "./Chatbot";
import { Aviso, Campo, mensajeDeError, type Mensaje } from "./ui";
import { Busqueda } from "./vistas/Busqueda";
import { Catalogo } from "./vistas/Catalogo";
import { Inicio } from "./vistas/Inicio";
import { Multas } from "./vistas/Multas";
import { Prestamos } from "./vistas/Prestamos";
import { Suspensiones } from "./vistas/Suspensiones";
import { Usuarios } from "./vistas/Usuarios";

export type Vista = "inicio" | "usuarios" | "catalogo" | "busqueda" | "prestamos" | "multas" | "suspensiones";

const MENU: Array<{ vista: Vista; etiqueta: string; roles: Rol[] }> = [
  { vista: "inicio", etiqueta: "Inicio", roles: ["Administrador", "Bibliotecario"] },
  { vista: "prestamos", etiqueta: "Prestar y devolver", roles: ["Administrador", "Bibliotecario"] },
  { vista: "multas", etiqueta: "Multas y adeudos", roles: ["Administrador", "Bibliotecario"] },
  { vista: "suspensiones", etiqueta: "Alumnos suspendidos", roles: ["Administrador", "Bibliotecario"] },
  { vista: "catalogo", etiqueta: "Gestionar libros", roles: ["Administrador", "Bibliotecario"] },
  { vista: "busqueda", etiqueta: "Buscar libros", roles: ["Administrador", "Bibliotecario", "Profesor", "Alumno", "Colaborador"] },
  { vista: "usuarios", etiqueta: "Gestión de usuarios", roles: ["Administrador"] },
];

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
      <button className="boton chico" onClick={() => setEscala((e) => Math.max(0.875, +(e - 0.125).toFixed(3)))} aria-label="Reducir tamaño de letra">A−</button>
      <button className="boton chico" onClick={() => setEscala((e) => Math.min(1.75, +(e + 0.125).toFixed(3)))} aria-label="Aumentar tamaño de letra">A+</button>
      <button className="boton chico" aria-pressed={alto} onClick={() => setAlto((a) => !a)}>Alto contraste</button>
    </div>
  );
}

function InicioSesion({ alEntrar }: { alEntrar: (s: Sesion) => void }) {
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [enviando, setEnviando] = useState(false);
  const entrar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const d = new FormData(e.currentTarget);
    setEnviando(true);
    try { alEntrar((await api<{ sesion: Sesion }>("/api/auth/sesion", { metodo: "POST", cuerpo: { identificador: d.get("identificador"), contrasena: d.get("contrasena") } })).sesion); }
    catch (err) { setMensaje(mensajeDeError(err)); } finally { setEnviando(false); }
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

  useEffect(() => { void api<{ sesion: Sesion | null }>("/api/auth/sesion").then((r) => entrar(r.sesion)).catch(() => setSesion(null)); }, []);
  const entrar = (s: Sesion | null) => { setSesion(s); if (s) setVista(esPersonal(s.rol) ? "inicio" : "busqueda"); };
  const salir = async () => { await api("/api/auth/sesion", { metodo: "DELETE" }).catch(() => undefined); setSesion(null); };
  const ir = (v: Vista) => { setVista(v); setMenuAbierto(false); document.getElementById("contenido")?.focus(); };

  if (sesion === undefined) return <p className="vacio" role="status">Comprobando sesión…</p>;
  if (!sesion) return <InicioSesion alEntrar={entrar} />;
  const opciones = MENU.filter((m) => m.roles.includes(sesion.rol));
  const titulo = opciones.find((o) => o.vista === vista)?.etiqueta ?? "";

  return (
    <div className="estructura">
      <a className="saltar" href="#contenido">Saltar al contenido</a>
      <nav className="lateral" aria-label="Menú principal" data-abierto={menuAbierto}>
        <div className="marca"><div className="marca-logo" aria-hidden="true">📚</div><div><strong>SIGEB</strong><span>Biblioteca · Universidad Ducky</span></div></div>
        <ul className="menu">
          {opciones.map((o) => <li key={o.vista}><button aria-current={vista === o.vista ? "page" : undefined} onClick={() => ir(o.vista)}>{o.etiqueta}</button></li>)}
        </ul>
        <div className="usuario-actual"><strong>{sesion.nombre}</strong><span>{sesion.rol} · {sesion.identificador}</span></div>
      </nav>
      <div className="principal">
        <header className="barra">
          <button className="boton boton-menu" aria-expanded={menuAbierto} onClick={() => setMenuAbierto((a) => !a)}>Menú</button>
          <h1>{titulo}</h1>
          <div className="acciones-barra"><ControlesAccesibilidad /><button className="boton chico" onClick={() => void salir()}>Cerrar sesión</button></div>
        </header>
        <main id="contenido" className="contenido" tabIndex={-1}>
          {vista === "inicio" && <Inicio sesion={sesion} ir={ir} />}
          {vista === "prestamos" && <Prestamos />}
          {vista === "multas" && <Multas sesion={sesion} />}
          {vista === "suspensiones" && <Suspensiones />}
          {vista === "catalogo" && <Catalogo sesion={sesion} />}
          {vista === "busqueda" && <Busqueda />}
          {vista === "usuarios" && <Usuarios sesion={sesion} />}
        </main>
      </div>
      <Chatbot />
    </div>
  );
}
