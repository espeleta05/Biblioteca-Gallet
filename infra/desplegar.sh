#!/bin/sh
# SIGEB · Puesta en producción (Propuesta 6.3, Sprint 4) en el servidor de la
# Universidad (Propuesta 3.4). Revisa que la configuración sea segura, levanta
# los contenedores y comprueba que el sistema responda a través del gateway.
#
# Uso, desde la raíz del repositorio:
#   sh infra/desplegar.sh            producción: se niega si algo no está listo
#   sh infra/desplegar.sh --pruebas  ambiente de pruebas: simuladores y datos de prueba
set -eu
cd "$(dirname "$0")/.."
export MSYS2_ARG_CONV_EXCL='*'

MODO=produccion
[ "${1:-}" = "--pruebas" ] && MODO=pruebas
FALLAS=0
ok()      { echo "  ✓ $1"; }
falla()   { echo "  ✗ $1"; FALLAS=$((FALLAS + 1)); }
aviso()   { echo "  ! $1"; }
valor()   { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }

echo "SIGEB · despliegue en modo $MODO"
echo "1. Configuración (.env)"
[ -f .env ] || { echo "  ✗ Falta .env: copia .env.example como .env y complétalo."; exit 1; }

PG=$(valor POSTGRES_PASSWORD); JWT=$(valor JWT_SECRET)
if [ ${#PG} -ge 16 ] && [ "$PG" != "cambia-esta-contrasena" ]; then ok "POSTGRES_PASSWORD definida (${#PG} caracteres)"; else falla "POSTGRES_PASSWORD debe tener al menos 16 caracteres y no ser la de ejemplo"; fi
if [ ${#JWT} -ge 32 ] && ! echo "$JWT" | grep -q '^reemplaza'; then ok "JWT_SECRET definido (${#JWT} caracteres)"; else falla "JWT_SECRET debe tener al menos 32 caracteres aleatorios"; fi

if [ "$MODO" = produccion ]; then
  ESC=$(valor URL_BD_ESCOLAR); TES=$(valor URL_TESORERIA)
  case "$ESC" in ''|*simulador*) falla "URL_BD_ESCOLAR debe apuntar a la base de datos escolar real, no al simulador";; *) ok "Base escolar: $ESC";; esac
  case "$TES" in ''|*simulador*) falla "URL_TESORERIA debe apuntar a Tesorería real, no al simulador";; *) ok "Tesorería: $TES";; esac
  [ "$(valor DATOS_PRUEBA)" = "sin-datos-prueba.sql" ] && ok "Sin cuentas ni catálogo de prueba" || falla "Define DATOS_PRUEBA=sin-datos-prueba.sql: en producción no se cargan cuentas con contraseña 1234"
  INICIAL=$(valor CONTRASENA_INICIAL_ESCOLAR)
  if [ ${#INICIAL} -ge 8 ] && [ "$INICIAL" != "1234" ]; then ok "Contraseña inicial de la base escolar definida"; else falla "CONTRASENA_INICIAL_ESCOLAR debe tener al menos 8 caracteres y no ser 1234"; fi
  case "$(valor RUTA_RESPALDOS)" in ''|./respaldos) aviso "RUTA_RESPALDOS apunta al mismo servidor; la propuesta (3.4) pide guardarlos en otro equipo";; *) ok "Respaldos en $(valor RUTA_RESPALDOS)";; esac
  for var in BANXICO_TOKEN SMTP_HOST WHATSAPP_TOKEN DIALOGFLOW_PROJECT_ID; do
    [ -n "$(valor $var)" ] && ok "$var configurado" || aviso "$var vacío: esa integración operará en modo simulado (ADR 0002)"
  done
fi

echo "2. Certificado HTTPS (infra/nginx/certs)"
CRT=infra/nginx/certs/sigeb.crt
if [ -f "$CRT" ] && [ -f infra/nginx/certs/sigeb.key ]; then
  if openssl x509 -in "$CRT" -noout -checkend 2592000 >/dev/null; then ok "Vigente por más de 30 días"; else falla "El certificado vence en menos de 30 días"; fi
  EMISOR=$(openssl x509 -in "$CRT" -noout -issuer | sed 's/^issuer=//'); SUJETO=$(openssl x509 -in "$CRT" -noout -subject | sed 's/^subject=//')
  if [ "$EMISOR" = "$SUJETO" ]; then
    [ "$MODO" = produccion ] && falla "Es autofirmado (de pruebas): coloca el certificado SSL del subdominio de la Universidad" || ok "Autofirmado de pruebas"
  else ok "Emitido por: $EMISOR"; fi
else
  falla "Faltan sigeb.crt y sigeb.key (en pruebas: sh infra/nginx/generar-certificado-dev.sh)"
fi

if [ "$FALLAS" -gt 0 ]; then
  echo "No se desplegó: corrige los $FALLAS punto(s) marcados con ✗ (detalle en docs/despliegue.md)."
  exit 1
fi

echo "3. Construir y levantar contenedores"
if [ "$MODO" = pruebas ]; then docker compose --profile pruebas up -d --build; else docker compose up -d --build; fi

echo "4. Comprobación a través del gateway"
INTENTOS=0
until [ "$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/api/auth/sesion)" = "200" ]; do
  INTENTOS=$((INTENTOS + 1))
  [ "$INTENTOS" -ge 60 ] && { echo "  ✗ El gateway no respondió en 2 minutos. Revisa: docker compose logs gateway usuarios"; exit 1; }
  sleep 2
done
ok "Inicio de sesión responde por HTTPS"
[ "$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/)" = "200" ] && ok "Aplicación web responde" || falla "La aplicación web no responde"
[ "$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/api/busqueda)" = "401" ] && ok "El gateway exige sesión (401)" || falla "El gateway no está validando la sesión"
DETENIDOS=$(docker compose ps -a --format '{{.Service}} {{.State}}' | grep -v ' running' || true)
[ -z "$DETENIDOS" ] && ok "Todos los contenedores en marcha" || { falla "Contenedores detenidos:"; echo "$DETENIDOS" | sed 's/^/      /'; }

if [ "$FALLAS" -gt 0 ]; then echo "Despliegue con problemas: revisa los puntos marcados con ✗."; exit 1; fi
if [ "$MODO" = pruebas ]; then
  echo "SIGEB (pruebas) en https://localhost · cuentas de prueba: admin / B-0041 / ALU001, contraseña 1234."
else
  echo "SIGEB desplegado. Siguiente paso: crear el primer administrador (docs/despliegue.md, paso 6)."
fi
