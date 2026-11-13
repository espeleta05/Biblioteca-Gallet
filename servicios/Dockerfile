# Imagen única para los microservicios NestJS de SIGEB. Cada contenedor elige su
# servicio con la variable SERVICIO (Propuesta 3.2: contenedores por microservicio).
FROM node:20.18.0-alpine AS construccion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY comun ./comun
COPY usuarios ./usuarios
COPY gestionar-libros ./gestionar-libros
COPY buscar-libros ./buscar-libros
COPY prestar-libros ./prestar-libros
COPY devolver-libros ./devolver-libros
COPY gestion-multas ./gestion-multas
COPY alumnos-suspendidos ./alumnos-suspendidos
COPY chatbot ./chatbot
COPY simuladores ./simuladores
RUN npm run build && npm prune --omit=dev

FROM node:20.18.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=construccion /app/node_modules ./node_modules
COPY --from=construccion /app/dist ./dist
USER node
# SERVICIO: usuarios | gestionar-libros | buscar-libros | prestar-libros | devolver-libros |
#           gestion-multas | alumnos-suspendidos | chatbot | simuladores
CMD ["sh", "-c", "node dist/${SERVICIO:?Define SERVICIO}/src/main.js ${SIMULADOR:-}"]
