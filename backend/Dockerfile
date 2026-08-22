# syntax=docker/dockerfile:1
#
# IMPORTANTE: el contexto de build de este Dockerfile es la RAÍZ del
# proyecto (ver docker-compose.prod.yml: build.context: .), no
# backend/ — así se puede copiar también database/migrations y
# database/seeds dentro de la imagen.
#
# El contenedor usa /backend y /database como carpetas hermanas —
# EXACTAMENTE el mismo layout que el proyecto en disco (backend/ y
# database/ como hermanos). Esto es deliberado: tanto knexfile.js como
# los seeds usan rutas relativas ('../../../database/...',
# '../../backend/...') para cruzar entre ambas carpetas, y esas rutas
# solo resuelven bien si los nombres coinciden con el disco local. Usar
# WORKDIR /app (con distinto nombre) rompe esas importaciones relativas.

# ---- Stage 1: dependencias de producción únicamente ----
FROM node:24-alpine AS deps
WORKDIR /backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev

# ---- Stage 2: imagen final de runtime ----
FROM node:24-alpine AS runtime
WORKDIR /backend
ENV NODE_ENV=production

# Usuario sin privilegios: el proceso Node nunca corre como root dentro
# del contenedor, aunque el contenedor en sí se ejecute con Docker.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /backend/node_modules ./node_modules
COPY backend/. .
COPY database /database

USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
