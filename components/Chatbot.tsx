"use client";
/** Chatbot (Sprint 4): disponible en la web para todos los roles, las 24 horas. */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../lib/api";

type Mensaje = { de: "usuario" | "bot"; texto: string };

export function Chatbot() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ de: "bot", texto: "Hola, soy el asistente de la biblioteca. Pregúntame por vigencias, renovaciones, multas, costos de reposición o por tus préstamos." }]);
  const [sugerencias, setSugerencias] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const final = useRef<HTMLDivElement>(null);

  useEffect(() => { if (abierto && !sugerencias.length) void api<Array<{ pregunta: string }>>("/api/chatbot/sugerencias").then((s) => setSugerencias(s.map((x) => x.pregunta))).catch(() => undefined); }, [abierto, sugerencias.length]);
  useEffect(() => { final.current?.scrollIntoView({ block: "end" }); }, [mensajes]);

  const preguntar = async (texto: string) => {
    if (!texto.trim() || enviando) return;
    setMensajes((m) => [...m, { de: "usuario", texto }]);
    setEnviando(true);
    try { const r = await api<{ respuesta: string }>("/api/chatbot/mensajes", { metodo: "POST", cuerpo: { texto } }); setMensajes((m) => [...m, { de: "bot", texto: r.respuesta }]); }
    catch { setMensajes((m) => [...m, { de: "bot", texto: "No pude responder en este momento. Intenta de nuevo." }]); }
    finally { setEnviando(false); }
  };
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const campo = e.currentTarget.elements.namedItem("pregunta") as HTMLInputElement;
    void preguntar(campo.value); campo.value = "";
  };

  return (
    <>
      <button className="boton primario chatbot-boton" aria-expanded={abierto} aria-controls="chatbot" onClick={() => setAbierto((a) => !a)}>{abierto ? "Cerrar asistente" : "Asistente de la biblioteca"}</button>
      {abierto && (
        <section id="chatbot" className="chatbot" aria-label="Asistente de la biblioteca">
          <header><strong>Asistente SIGEB</strong><button className="boton chico" onClick={() => setAbierto(false)} aria-label="Cerrar asistente">×</button></header>
          <div className="chatbot-mensajes" role="log" aria-live="polite">
            {mensajes.map((m, i) => <p key={i} className={`burbuja ${m.de}`}><span className="solo-lectores">{m.de === "bot" ? "Asistente: " : "Tú: "}</span>{m.texto}</p>)}
            {mensajes.length === 1 && <div className="chatbot-sugerencias">{sugerencias.map((s) => <button key={s} className="boton chico" onClick={() => void preguntar(s)}>{s}</button>)}</div>}
            {enviando && <p className="burbuja bot">Escribiendo…</p>}
            <div ref={final} />
          </div>
          <form onSubmit={enviar}>
            <label className="solo-lectores" htmlFor="pregunta-chatbot">Escribe tu pregunta</label>
            <input id="pregunta-chatbot" name="pregunta" maxLength={300} placeholder="Escribe tu pregunta" autoComplete="off" />
            <button className="boton primario" disabled={enviando}>Enviar</button>
          </form>
        </section>
      )}
    </>
  );
}
