# frontend/Dockerfile
#
# Build multi-stage: compila el SPA de React con Vite y sirve el
# resultado estático (frontend/dist) con nginx. Usado tanto por
# docker-compose.yml (dev) como docker-compose.prod.yml — la config de
# nginx (nginx.conf / nginx.prod.conf) se sigue montando como volumen
# desde el compose, no se hornea en esta imagen.
#
# Nota para desarrollo activo del frontend: reconstruir esta imagen en
# cada cambio (`docker compose up --build`) no da hot-reload. Para
# iterar rápido corré `npm run dev` directamente en frontend/ (apunta
# por proxy al backend expuesto en localhost:3000 por docker-compose.yml,
# ver frontend/vite.config.js) y usá ese servidor de Vite mientras
# desarrollás; el Dockerfile queda para levantar el stack completo tal
# como se vería en producción.

FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
