#!/bin/sh
# Genera un certificado autofirmado SOLO para el ambiente de pruebas.
# En producción la Universidad entrega el certificado SSL del subdominio
# institucional (Propuesta 3.4) y se coloca en infra/nginx/certs/.
set -eu
# En Git Bash (Windows) evita que "/CN=..." se convierta en una ruta de Windows.
export MSYS2_ARG_CONV_EXCL='*'
DIR="$(dirname "$0")/certs"
mkdir -p "$DIR"
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -subj "/CN=localhost/O=SIGEB pruebas" \
  -keyout "$DIR/sigeb.key" -out "$DIR/sigeb.crt"
echo "Certificado de pruebas creado en $DIR"
