# SIGEB · Deja el ambiente de pruebas listo para la exposición de funciones.
# Reinicia la base con los datos de prueba y carga db/escena-demostracion.sql.
# Uso (PowerShell, desde la carpeta del proyecto, con Docker Desktop abierto):
#   powershell -ExecutionPolicy Bypass -File infra\preparar-demostracion.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '1. Levantando el sistema (Docker Compose)...'
docker compose --profile pruebas up -d
if ($LASTEXITCODE -ne 0) { throw 'No se pudo levantar el sistema. ¿Está abierto Docker Desktop?' }

Write-Host '2. Reiniciando la base de datos y cargando la escena de demostración...'
docker compose cp db/escena-demostracion.sql db:/tmp/escena-demostracion.sql
docker compose exec -T db psql -U sigeb -d sigeb -q -v ON_ERROR_STOP=1 -o /dev/null `
  -f /docker-entrypoint-initdb.d/01-esquema.sql `
  -f /docker-entrypoint-initdb.d/02-datos-base.sql `
  -f /docker-entrypoint-initdb.d/03-datos-prueba.sql `
  -f /tmp/escena-demostracion.sql 2>&1 | Where-Object { $_ -notmatch 'NOTICE' }
if ($LASTEXITCODE -ne 0) { throw 'Falló la carga de la escena.' }

Write-Host ''
Write-Host 'Listo. Abre https://localhost (contraseña de todas las cuentas: 1234).'
Write-Host 'Guion de la exposición: docs/guion-exposicion.md'
