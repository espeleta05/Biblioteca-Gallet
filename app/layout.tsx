import "./globals.css";

export const metadata = {
  title: "SIGEB | Biblioteca universitaria",
  description: "Sistema de gestión bibliotecaria",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
