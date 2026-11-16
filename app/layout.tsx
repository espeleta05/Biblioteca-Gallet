import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "SIGEB · Biblioteca Universidad Ducky",
  description: "Sistema Integral de Gestión Bibliotecaria",
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function Raiz({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
