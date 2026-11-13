"use client";
/** Vista de impresión de un recibo de préstamo o de pago (canal "Impresión"). */
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function Recibo({ params }: { params: Promise<{ folio: string }> }) {
  const [contenido, setContenido] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void params.then(({ folio }) => api<{ contenido: string }>(`/api/recibos/${encodeURIComponent(folio)}`))
      .then((r) => { setContenido(r.contenido); setTimeout(() => window.print(), 300); })
      .catch((e: Error) => setError(e.message));
  }, [params]);
  return (
    <main className="contenido">
      {error && <p role="alert">{error}</p>}
      {contenido ? <pre className="recibo">{contenido}</pre> : !error && <p role="status">Cargando recibo…</p>}
      <button className="boton primario no-imprimir" onClick={() => window.print()}>Imprimir</button>
    </main>
  );
}
