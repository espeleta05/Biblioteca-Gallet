/**
 * Aplicación web de SIGEB. En producción el API Gateway (NGINX) atiende /api.
 * En desarrollo sin Docker, Next.js reenvía cada prefijo de /api al puerto del
 * microservicio correspondiente (misma tabla de rutas que infra/nginx/sigeb.conf).
 */
const rutasDesarrollo = [
  ["/api/auth", 4001], ["/api/usuarios", 4001],
  ["/api/libros", 4002], ["/api/solicitudes-compra", 4002],
  ["/api/busqueda", 4003],
  ["/api/prestamos", 4004], ["/api/lista-espera", 4004], ["/api/recibos", 4004],
  ["/api/devoluciones", 4005],
  ["/api/multas", 4006], ["/api/adeudos", 4006], ["/api/tipo-cambio", 4006],
  ["/api/suspensiones", 4007],
  ["/api/chatbot", 4008],
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return rutasDesarrollo.flatMap(([prefijo, puerto]) => [
      { source: prefijo, destination: `http://localhost:${puerto}${prefijo}` },
      { source: `${prefijo}/:ruta*`, destination: `http://localhost:${puerto}${prefijo}/:ruta*` },
    ]);
  },
};

export default nextConfig;
