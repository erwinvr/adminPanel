# Manual de despliegue

Guía paso a paso para levantar el Panel de Administración completo
(PostgreSQL + backend Express + microservicio `netbackup-agent` +
frontend servido por nginx) en desarrollo y en producción. Todo el
stack corre con Docker Compose — no hace falta instalar Node, Python
ni PostgreSQL en el host salvo que quieras trabajar sin Docker (ver
§7).

## Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Clonar el repositorio](#2-clonar-el-repositorio)
3. [Variables de entorno](#3-variables-de-entorno)
4. [Desarrollo — paso a paso](#4-desarrollo--paso-a-paso)
5. [Producción on-prem — paso a paso](#5-producción-on-prem--paso-a-paso)
6. [Primeros pasos después de desplegar](#6-primeros-pasos-después-de-desplegar)
7. [Ejecución sin Docker (desarrollo puntual)](#7-ejecución-sin-docker-desarrollo-puntual)
8. [Actualizar una instalación existente](#8-actualizar-una-instalación-existente)
9. [Arquitectura de servicios](#9-arquitectura-de-servicios)
10. [Resolución de problemas comunes](#10-resolución-de-problemas-comunes)

---

## 1. Requisitos previos

- Docker y Docker Compose (plugin `docker compose`, no el binario viejo
  `docker-compose`).
- Para producción: un dominio o IP fija, y certificados TLS (propios o
  de una CA interna) — ver §5.
- Para desarrollo sin Docker (§7): Node.js **24.x LTS**, Python 3.12+ y
  PostgreSQL 16 instalados localmente.

## 2. Clonar el repositorio

```bash
git clone https://github.com/erwinvr/adminPanel.git
cd adminPanel
```

## 3. Variables de entorno

```bash
cp .env.example .env
```

Completar en `.env` (todas las que no tienen "opcional" son
obligatorias — el backend rechaza arrancar con un mensaje claro si
falta alguna o tiene formato inválido):

| Variable | Descripción |
|---|---|
| `NODE_ENV` | `development`, `test` o `production` |
| `PORT` | Puerto interno del backend (por defecto `3000`, no hace falta tocarlo con Docker) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciales con las que se inicializa el contenedor de PostgreSQL la primera vez que se crea el volumen |
| `DATABASE_URL` | Cadena de conexión completa (`postgres://usuario:password@db:5432/base`) — el host debe ser `db` y debe coincidir exactamente con los tres `POSTGRES_*` de arriba |
| `SESSION_SECRET` | Cadena aleatoria de al menos 32 caracteres. Generar con: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SESSION_COOKIE_NAME` | Nombre de la cookie de sesión (por defecto `sid`) |
| `SESSION_MAX_AGE_MS` | Duración de la sesión en milisegundos (por defecto 8 horas) |
| `CORS_ORIGIN` | Origen exacto permitido para llamadas al API (ej. `http://localhost:8080` en dev, `https://tu-dominio` en producción) |
| `LOG_LEVEL` | `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace` |
| `LOGIN_RATE_LIMIT_WINDOW_MS` / `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` | Ventana y máximo de intentos de login por IP |
| `ACCOUNT_LOCK_MAX_FAILED_ATTEMPTS` / `ACCOUNT_LOCK_DURATION_MS` | Umbral y duración del bloqueo de cuenta |
| `M365_ENCRYPTION_KEY` | Clave hex de 64 caracteres (32 bytes, AES-256) usada para cifrar en reposo TODOS los secretos guardados en la app (client secret de M365, bind password de AD, contraseñas de Veeam/Vuln/Vault/SMTP/Backup Networking) — no es solo de M365 pese al nombre histórico. Generar con: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **Si se cambia después de tener datos cargados, todos los secretos ya guardados quedan ilegibles** — hay que volver a cargarlos desde cada pantalla de configuración |
| `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` | Usadas SOLO por `npm run seed:run` para crear el usuario administrador inicial — sin valores por defecto a propósito, no existe un admin/admin de fábrica |
| `NETBACKUP_MICROSERVICE_URL` | *(Opcional)* URL del microservicio `netbackup-agent` (drivers Cisco/FortiGate de Backup Networking). Default `http://netbackup-agent:8000`, ya correcto para ambos `docker-compose*.yml` — solo hace falta tocarlo si ese servicio corre en otro host |

**Nunca** commitear el archivo `.env` real — está excluido en
`.gitignore`.

## 4. Desarrollo — paso a paso

1. Completar `.env` (§3) — para desarrollo alcanza con valores de
   ejemplo, menos `M365_ENCRYPTION_KEY` y `SESSION_SECRET`, que igual
   deben generarse (el backend valida el formato aunque sea dev).
2. Levantar todo el stack:
   ```bash
   docker compose up --build
   ```
   Esto construye y levanta 4 contenedores: `db` (PostgreSQL),
   `backend` (Express, con hot-reload vía `nodemon`), `netbackup-agent`
   (microservicio Python, con hot-reload vía `uvicorn --reload`) y
   `nginx` (sirve el build de producción de Vite + proxy `/api`).
3. En otra terminal, aplicar migraciones y crear el usuario
   administrador inicial (solo la primera vez):
   ```bash
   docker compose exec backend npm run migrate:latest
   docker compose exec backend npm run seed:run
   ```
4. Abrir **http://localhost:8080** — login con `ADMIN_USERNAME` /
   `ADMIN_INITIAL_PASSWORD` (los que pusiste en `.env`). La cuenta
   queda con cambio de contraseña obligatorio en el primer ingreso.

**Puertos expuestos en dev** (para depuración directa, no todos están
en producción):

| Puerto | Servicio | Uso |
|---|---|---|
| `8080` | nginx | La app completa (frontend + `/api`) |
| `3000` | backend | API directa, sin pasar por nginx |
| `8001` | netbackup-agent | Microservicio directo (`GET /health`) |
| `5432` | PostgreSQL | Conectar con un cliente SQL local |

**Iterar en frontend sin reconstruir la imagen de nginx:** `nginx` en
dev construye el build estático de Vite, no tiene hot-reload. Para
iterar rápido:
```bash
cd frontend
npm install
npm run dev   # Vite, con proxy de /api hacia localhost:3000
```
El backend y `netbackup-agent` sí recargan solos al guardar cambios
(bind mounts + `nodemon`/`--reload`) — no hace falta reconstruir nada
para esos dos. Para ver un cambio de frontend dentro de Docker (no vía
`npm run dev`), sí hace falta:
```bash
docker compose build nginx && docker compose up -d nginx
```

## 5. Producción on-prem — paso a paso

1. Completar `.env` con valores **reales** de producción —
   `SESSION_SECRET` y `M365_ENCRYPTION_KEY` generados específicamente
   para este entorno (no reusar los de dev), contraseñas fuertes en
   `POSTGRES_PASSWORD`, `CORS_ORIGIN` con el dominio real.
2. Colocar los certificados TLS reales:
   ```
   nginx/certs/fullchain.pem
   nginx/certs/privkey.pem
   ```
   (autofirmados o de tu CA interna — la carpeta existe en el repo
   pero los `.pem` no se versionan, hay que copiarlos a mano en el
   servidor de destino).
3. Levantar todo el stack:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
   Diferencias clave frente a dev: PostgreSQL no expone su puerto al
   host, el backend usa la imagen multi-stage optimizada (sin
   devDependencies ni bind mounts de código fuente), `netbackup-agent`
   tampoco expone puerto (solo lo alcanza el backend por la red
   interna), y nginx sirve HTTPS con redirección forzada desde HTTP —
   son los ÚNICOS puertos publicados al host (`80` y `443`).
4. Aplicar migraciones y crear el usuario administrador inicial (solo
   la primera vez):
   ```bash
   docker compose -f docker-compose.prod.yml exec backend npm run migrate:latest
   docker compose -f docker-compose.prod.yml exec backend npm run seed:run
   ```
5. Confirmar que los 4 contenedores están sanos:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```
   `db` y `backend` tienen healthcheck propio (`healthy` en la
   columna STATUS); `netbackup-agent` y `nginx` no lo tienen definido,
   alcanza con que digan `Up`.

**Respaldo de base de datos:** queda fuera del alcance de este
proyecto — se resuelve a nivel de snapshot/backup de la VM completa.

## 6. Primeros pasos después de desplegar

Con el usuario administrador ya creado (§4 o §5, paso de seed):

1. **Cambiar la contraseña temporal** — el primer login fuerza el
   cambio (`must_change_password = true` en el seed).
2. **Configurar SMTP** (Configuración → SMTP) — necesario para que
   "Olvidé mi contraseña" en el login funcione; sin esto configurado,
   ese flujo genera la contraseña temporal pero no puede enviarla por
   correo. Se puede probar con el botón "Enviar prueba" antes de
   depender de él.
3. **Crear roles y usuarios reales**, y recién ahí sacarle permisos al
   usuario `admin` de fábrica si tu política lo requiere (nunca
   eliminarlo sin tener antes otro usuario con el rol `administrator`
   funcionando).
4. Si vas a usar **Backup Networking**: cargar el hardware de tipo
   "Networking" en el inventario (con IP de administración), y recién
   ahí configurar el dispositivo de backup correspondiente — el
   driver `raw_ssh` no necesita nada más; `napalm_ios`/`fortios_api`
   dependen de que el contenedor `netbackup-agent` esté corriendo
   (viene levantado por defecto en ambos `docker-compose*.yml`).
5. Si vas a usar **Active Directory → Operaciones** (ver quién tiene
   la cuenta bloqueada y desbloquearla desde la app): la cuenta de
   servicio configurada en "Active Directory → Configuración" necesita
   un permiso de AD adicional al de lectura que ya usa para
   sincronizar — ver [`docs/active-directory.md`](active-directory.md)
   para el permiso preciso y cómo delegarlo.

## 7. Ejecución sin Docker (desarrollo puntual)

Backend:
```bash
cd backend
npm install
npm run migrate:latest
npm run dev
```

Frontend (hot-reload real):
```bash
cd frontend
npm install
npm run dev
```

`netbackup-agent` (solo si vas a probar drivers Cisco/FortiGate sin
Docker):
```bash
cd netbackup-agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Con esto corriendo fuera de Docker, `NETBACKUP_MICROSERVICE_URL` en tu
`.env` local del backend debe apuntar a `http://localhost:8000` en vez
del default (`http://netbackup-agent:8000`, que es el nombre del
servicio dentro de la red de Docker Compose y no resuelve fuera de
ella).

## 8. Actualizar una instalación existente

```bash
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build   # o docker-compose.yml en dev
docker compose -f docker-compose.prod.yml exec backend npm run migrate:latest
docker compose -f docker-compose.prod.yml exec backend npm run seed:run
```

`seed:run` es seguro de correr siempre (los seeds hacen upsert, no
fallan si el dato ya existe) — sirve para que cualquier permiso nuevo
agregado en una actualización quede registrado en la tabla
`permissions` sin tener que revisar manualmente qué cambió.

## 9. Arquitectura de servicios

```
┌──────────────┐   HTTPS/HTTP    ┌──────────────┐   proxy /api/*   ┌──────────────┐
│   Navegador  │ ───────────────▶│    nginx     │ ────────────────▶│   Backend    │
│              │◀─────────────── │ (frontend +  │◀────────────────│  (Express)   │
└──────────────┘                 │reverse proxy)│                  └──────┬───────┘
                                  └──────────────┘                         │
                                                          ┌─────────────────┼──────────────────┐
                                                          │ Knex (pg)       │ HTTP (interno)    │
                                                          ▼                 ▼
                                                ┌──────────────────┐ ┌──────────────────────┐
                                                │  PostgreSQL 16    │ │  netbackup-agent      │
                                                │                    │ │  (FastAPI, Python)    │
                                                └──────────────────┘ │  NAPALM (Cisco) +      │
                                                                      │  API REST (FortiGate) │
                                                                      └──────────────────────┘
```

El backend Node nunca se expone directamente al exterior — ni en dev
ni en producción — solo a través de nginx. `netbackup-agent` nunca se
expone al exterior en producción — solo el backend lo alcanza, por la
red interna de Docker Compose (mismo nivel de confianza que la base
de datos).

## 10. Resolución de problemas comunes

**El backend no arranca, error de "Configuración de entorno
inválida"** — falta o tiene formato inválido alguna variable
obligatoria del `.env` (§3). El mensaje de error lista exactamente
cuál.

**`docker compose exec backend npm run migrate:latest` falla con `sh:
knex: not found`** — puede pasar tras varios reinicios seguidos del
contenedor en dev, si el volumen nombrado `backend_node_modules`
quedó en un estado inconsistente. Se resuelve sin perder datos:
```bash
docker compose up -d --force-recreate backend
```

**Cambios en `backend/package.json` (nueva dependencia) no aparecen
en el contenedor** — en dev, el volumen `backend_node_modules` no se
reconstruye solo al editar `package.json`. Instalar la dependencia
DENTRO del contenedor (`docker compose exec backend npm install
<paquete>`), no en el host.

**Un driver `napalm_ios`/`fortios_api` de Backup Networking falla con
"no se pudo contactar al servicio de extracción"** — confirmar que el
contenedor `netbackup-agent` está `Up` (`docker compose ps`) y que
responde: `curl http://localhost:8001/health` en dev (puerto interno
`8000` en producción, sin publicar al host).

**"Olvidé mi contraseña" no llega el correo** — confirmar la
configuración de Configuración → SMTP con el botón "Enviar prueba".
El cambio de contraseña temporal ocurre igual aunque el envío falle
(el usuario admin puede regenerarla manualmente si hace falta) — el
error de envío queda en el log del backend, no se le muestra a quien
pidió la recuperación (por diseño, para no filtrar si un usuario
existe o no).
