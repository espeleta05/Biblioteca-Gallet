# Aplicación web (React + TypeScript con Next.js) para administradores y bibliotecarios.
FROM node:20.18.0-alpine AS construccion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20.18.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=construccion /app/.next/standalone ./
COPY --from=construccion /app/.next/static ./.next/static
COPY --from=construccion /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
