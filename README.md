# SIGEB · Sistema Integral de Gestión Bibliotecaria

Sistema para la Biblioteca de la Universidad Ducky. Automatiza:
- préstamo, renovación y devolución;
- multas, pagos y personas suspendidas;
- catálogo y búsqueda de libros;
- un chatbot para consultas.

Se construyó **exactamente** según la *Propuesta de Negocio por Sprint* de Gallet Desarrollo de Software, siguiendo SWEBOK V4 e *Ingeniería de Software en Google*.

## Arquitectura (Propuesta 3.1 y 3.2)

```
Web (React + TypeScript / Next.js)     App móvil (React Native / Expo)
                 \                         /
              API Gateway NGINX (HTTPS, valida JWT y rol con auth_request)
                                  |
  usuarios · gestionar-libros · buscar-libros · prestar-libros · devolver-libros
  gestion-multas · alumnos-suspendidos · chatbot        (microservicios NestJS)
                                  |
  PostgreSQL SIGEB   BD escolar   Tesorería   Banxico   SMTP/WhatsApp   Dialogflow CX
```

| Carpeta | Contenido |
|---|---|
| `servicios/` | 8 microservicios NestJS + `comun/` (reglas de negocio, JWT, BD, integraciones) + simuladores + pruebas |
| `app/`, `components/`, `lib/` | Aplicación web |
| `app-movil/` | App React Native: buscar libros y chatbot |
| `db/` | `esquema.sql` y `datos.sql` |
| `infra/` | NGINX (gateway) y scripts de respaldo y restauración |
| `docs/` | ADRs, trazabilidad, manual de usuario, UAT, normas, decisiones pendientes, verificación contra los libros |

## Ejecutar con Docker (recomendado)

```bash
cp .env.example .env              # completa POSTGRES_PASSWORD y JWT_SECRET
sh infra/nginx/generar-certificado-dev.sh
docker compose --profile pruebas up -d --build
```

Abre https://localhost. En producción no se usa `--profile pruebas`; en su lugar, `URL_BD_ESCOLAR` y `URL_TESORERIA` apuntan a los sistemas reales.

## Desarrollo sin Docker

Requiere Node 20 o superior y PostgreSQL 14 o superior.

```bash
psql -d sigeb -f db/esquema.sql && psql -d sigeb -f db/datos.sql
cd servicios && npm ci && npm run build
DATABASE_URL=postgres://... JWT_SECRET=<32+ caracteres> npm run inicio   # 8 servicios + simuladores
cd .. && npm ci && npm run dev                                            # web en http://localhost:3000
cd app-movil && npm ci && EXPO_PUBLIC_URL_API=http://<tu-ip>:3000 npx expo start
```

## Pruebas

```bash
cd servicios
npm run typecheck
npm test            # 150 unitarias + 59 de integración (necesita PostgreSQL de pruebas en DATABASE_URL)
```

La prueba de carga (≤ 3 s con 100 usuarios) está en `pruebas/carga/k6-busqueda.js`. Los respaldos se hacen a diario con 30 días de retención (servicio `respaldos`); para restaurar se usa `infra/respaldos/restaurar.sh`.

## Cuentas de prueba

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `1234` |
| Bibliotecaria | `B-0041` | `1234` |
| Alumnos | `ALU001`–`ALU100` | `1234` |
| Profesores | `PROF001`–`PROF020` | `1234` |
| Colaboradores | `COL001`–`COL005` | `1234` |

Cámbialas antes de producción.

## Documentos clave

- [Trazabilidad backlog → código → pruebas](docs/trazabilidad.md)
- [Verificación contra SWEBOK y Google](docs/verificacion-libros.md)
- [Decisiones pendientes con el Product Owner](docs/decisiones-pendientes.md)
- [Manual de usuario](docs/manual-usuario.md) · [Guion de UAT](docs/pruebas-aceptacion-uat.md) · [Normas](docs/normas.md)
- [ADR 0001 Arquitectura](docs/adr/0001-arquitectura-microservicios.md) · [ADR 0002 Integraciones](docs/adr/0002-integraciones-con-modo-simulado.md)
