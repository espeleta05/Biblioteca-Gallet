# Puesta en producción de SIGEB

Es la tarea **"Puesta en producción y prueba de restauración de respaldos"** del Sprint 4 (Propuesta 6.3). Responsable: Scrum Master. Se hace en la infraestructura que entrega la Universidad (Propuesta 3.4), con Docker Compose (Propuesta 3.2).

El procedimiento se probó el 2026-11-15 en un equipo con Docker Desktop. Faltó solo lo que depende de la Universidad: su servidor, su certificado y sus sistemas reales.

## 1. Lo que la Universidad debe entregar antes (Propuesta 3.4 y 9.4)

| Componente | Especificación mínima | Fecha límite (9.4) |
|---|---|---|
| Servidor de aplicación | 4 vCPU, 8 GB de RAM, 100 GB SSD, Linux con Docker y Docker Compose; puertos 80 y 443 abiertos | Antes del Sprint 4 |
| Almacenamiento de respaldos | 200 GB en un equipo distinto al servidor o en la nube, montado en el servidor | Antes del Sprint 4 |
| Dominio y certificado SSL | Subdominio institucional (p. ej. `biblioteca.ducky.edu.mx`) apuntando al servidor, con su certificado y llave | Antes del Sprint 4 |
| Base de datos escolar | URL de su API de solo lectura (contrato en `docs/api/integraciones.md`) | Cierre del Sprint 0 |
| Tesorería y Servicios Escolares | URL de sus APIs de pagos y avisos | Cierre del Sprint 0 |
| Cuentas de terceros | Token de Banxico (API SIE), SMTP institucional, WhatsApp Business, agente de Dialogflow CX | Antes del Sprint 4 |
| Equipos de mostrador | PC con Chrome, Edge o Firefox actualizado e impresora para recibos | Antes del Sprint 4 |

## 2. Preparar el servidor

```bash
docker --version && docker compose version
git clone <URL del repositorio del equipo> sigeb && cd sigeb
```

Usa la rama que contiene esta versión (`main` una vez fusionado el PR del Sprint 4).

## 3. Configurar `.env`

```bash
cp .env.example .env
```

| Variable | Valor en producción |
|---|---|
| `POSTGRES_PASSWORD` | Al menos 16 caracteres aleatorios (`openssl rand -hex 16`) |
| `JWT_SECRET` | Al menos 32 caracteres aleatorios (`openssl rand -hex 32`) |
| `DATOS_PRUEBA` | `sin-datos-prueba.sql`: no carga cuentas con contraseña 1234 ni el catálogo de demostración |
| `URL_BD_ESCOLAR`, `URL_TESORERIA` | Las URL reales que entregó la Universidad |
| `CONTRASENA_INICIAL_ESCOLAR` | La que acuerden con Servicios Escolares para los alumnos (8 caracteres o más) |
| `RUTA_RESPALDOS` | La ruta del almacenamiento de respaldos montado (otro equipo) |
| `BANXICO_TOKEN`, `SMTP_*`, `WHATSAPP_*`, `DIALOGFLOW_*` | Las credenciales de la Universidad. Vacías = esa integración opera en modo simulado (ADR 0002) |

`.env` nunca se sube al repositorio.

## 4. Certificado HTTPS

Copia el certificado y la llave del subdominio como `infra/nginx/certs/sigeb.crt` e `infra/nginx/certs/sigeb.key`. Si el certificado trae cadena intermedia, `sigeb.crt` debe contener el certificado y después la cadena.

## 5. Desplegar

```bash
sh infra/desplegar.sh
```

Antes de levantar nada, el script **revisa la configuración y se niega a desplegar** si encuentra:
- contraseñas débiles o las de ejemplo;
- simuladores en lugar de los sistemas reales;
- datos de prueba;
- un certificado autofirmado o que vence en menos de 30 días.

Después construye las imágenes, levanta los contenedores y comprueba por HTTPS el inicio de sesión, la web, que el gateway exija sesión y que todos los contenedores estén en marcha.

## 6. Crear el primer administrador

En producción no hay cuentas precargadas. La contraseña va en una variable de entorno, para que no quede en el historial:

```bash
read -s CONTRASENA_ADMIN && export CONTRASENA_ADMIN
docker compose exec -e CONTRASENA_ADMIN usuarios node dist/usuarios/src/crear-administrador.js A-0001 "Nombre del Administrador de biblioteca" correo@ducky.edu.mx
unset CONTRASENA_ADMIN
```

Con esa cuenta, en **Gestión de usuarios**:
- da de alta a los bibliotecarios con **Alta de personal**;
- pulsa **Verificar con base escolar** para cargar a los alumnos, profesores y colaboradores.

## 7. Prueba de restauración de respaldos (obligatoria antes de la entrega)

El contenedor `respaldos` genera un respaldo al arrancar y después uno diario, y conserva 30 días. Para probar la restauración completa:

```bash
docker compose exec respaldos ls -la /respaldos
docker compose exec respaldos sh /scripts/restaurar.sh /respaldos/<archivo>.dump
```

El script imprime los conteos de préstamos, multas y libros: deben coincidir con los de antes. Anota el resultado en el acta de entrega (evidencia ISO 9001).

## 8. App móvil

Compila la app apuntando al dominio real y publícala en las tiendas. Las cuentas de Google Play y App Store son de la Universidad (9.3).

```bash
cd app-movil
npx eas-cli build --platform all
```

Antes de compilar, define `EXPO_PUBLIC_URL_API=https://biblioteca.ducky.edu.mx` (o cambia `extra.urlApi` en `app.json`).

## Actualizar a una versión nueva

```bash
git pull
sh infra/desplegar.sh
```

Los datos se conservan en el volumen `datos-sigeb`. Para regresar a la versión anterior: `git checkout <commit anterior>` y `sh infra/desplegar.sh`. Si hubo un problema con los datos, restaura el último respaldo (paso 7).

## Operación diaria

| Tarea | Comando |
|---|---|
| Ver estado | `docker compose ps` |
| Ver registros de un servicio | `docker compose logs -f prestar-libros` |
| Reiniciar un servicio | `docker compose restart prestar-libros` |
| Apagar todo (los datos se conservan) | `docker compose down` |
