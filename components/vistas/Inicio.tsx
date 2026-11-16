"use client";
/** Inicio del personal: resumen y accesos directos (navegación en máximo 3 clics). */
import { api, pesos, type Sesion } from "../../lib/api";
import { Aviso, useDatos } from "../ui";
import type { Vista } from "../Aplicacion";

type Resumen = { libros: number; disponibles: number; prestamos: number; vencidos: number; deudores: number; adeudo: number; suspendidos: number };

export function Inicio({ sesion, ir }: { sesion: Sesion; ir: (v: Vista) => void }) {
  const resumen = useDatos(async (): Promise<Resumen> => {
    const [libros, prestamos, adeudos, suspensiones] = await Promise.all([
      api<Array<{ total: number; disponibles: number }>>("/api/libros"),
      api<Array<{ vencido: boolean }>>("/api/prestamos?estado=Activo"),
      api<Array<{ totalMxn: number }>>("/api/adeudos"),
      api<unknown[]>("/api/suspensiones?estado=Activa"),
    ]);
    return {
      libros: libros.reduce((s, l) => s + l.total, 0), disponibles: libros.reduce((s, l) => s + l.disponibles, 0),
      prestamos: prestamos.length, vencidos: prestamos.filter((p) => p.vencido).length,
      deudores: adeudos.length, adeudo: adeudos.reduce((s, a) => s + a.totalMxn, 0), suspendidos: suspensiones.length,
    };
  }, []);
  const r = resumen.datos;
  return (
    <>
      <div className="encabezado"><div><h2>Hola, {sesion.nombre.split(" ")[0]}</h2><p>Resumen de la biblioteca al momento.</p></div></div>
      <Aviso mensaje={resumen.error} />
      <section className="tarjetas" aria-label="Indicadores">
        <div className="tarjeta"><span>Ejemplares disponibles</span><strong>{r ? `${r.disponibles} / ${r.libros}` : "…"}</strong></div>
        <div className="tarjeta"><span>Préstamos activos</span><strong>{r?.prestamos ?? "…"}</strong>{r && r.vencidos > 0 && <span>{r.vencidos} vencido(s)</span>}</div>
        <div className="tarjeta"><span>Personas con adeudos</span><strong>{r?.deudores ?? "…"}</strong>{r && <span>{pesos(r.adeudo)}</span>}</div>
        <div className="tarjeta"><span>Suspensiones activas</span><strong>{r?.suspendidos ?? "…"}</strong></div>
      </section>
      <section className="panel" aria-labelledby="atajos"><h2 id="atajos">Operaciones frecuentes</h2>
        <div className="atajos">
          <button className="boton primario" onClick={() => ir("prestamos")}>Prestar o devolver un libro</button>
          <button className="boton" onClick={() => ir("multas")}>Registrar pago de multa</button>
          <button className="boton" onClick={() => ir("busqueda")}>Buscar un libro</button>
          <button className="boton" onClick={() => ir("catalogo")}>Nueva ficha bibliográfica</button>
          {sesion.rol === "Administrador" && <button className="boton" onClick={() => ir("usuarios")}>Gestionar usuarios</button>}
        </div>
      </section>
    </>
  );
}
