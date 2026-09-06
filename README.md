# Panel de Administración — Backend + Frontend

Aplicación web de gestión de usuarios con autenticación segura y
autorización granular basada en permisos (RBAC), con auditoría de
acciones administrativas.

> **Estado actual: Fases 1 a 10 completas.**
> Autenticación (Argon2id + sesiones + CSRF), RBAC granular,
> ABM de usuarios, administración de roles/permisos, auditoría
> inmutable a nivel de PostgreSQL, frontend funcional (login, dashboard,
> usuarios, roles, auditoría), 40 tests automatizados (unitarios,
> integración y seguridad) y revisión de hardening — ver
> `docs/hardening-report.md` para los hallazgos y su estado.

---

## 1. Arquitectura

```
┌──────────────┐   HTTPS/HTTP    ┌──────────────┐   proxy /api/*   ┌──────────────┐
│   Navegador  │ ───────────────▶│    nginx     │ ────────────────▶│   Backend    │
│              │                 │ (frontend    │                  │  (Express)   │
│              │◀─────────────── │  estático +  │◀──────────────── │              │
└──────────────┘                 │  reverse     │                  └──────┬───────┘
                                  │  proxy)      │                         │
                                  └──────────────┘                         │ Knex (pg)
                                                                            ▼
                                                                  ┌──────────────────┐
                                                                  │   PostgreSQL 16   │
                                                                  └──────────────────┘
```

El frontend (React + Vite, ver sección 15) nunca llama directamente a
la base de datos ni conoce el hostname del backend: todo pasa por
rutas relativas `/api/...` que nginx redirige internamente. `nginx`
sirve el build estático de Vite (horneado en su imagen por
`frontend/Dockerfile`) — ya no hay bind mount del código fuente del
frontend ni servido de `.js` sueltos.

Capas del backend: `routes → middleware → controllers → services →
repositories → base de datos`. Los controllers son delgados; la lógica de
negocio vive en `services/`, la persistencia en `repositories/` (ambas
carpetas se poblarán a partir de la Fase 3/4).

## 2. Requisitos

- Docker y Docker Compose (ya instalados en el servidor on-prem de destino).
- Para desarrollo sin Docker: Node.js **24.x LTS** y PostgreSQL 16 localmente.

## 3. Configuración

```bash
cp .env.example .env
```

Completar en `.env`:

| Variable | Descripción |
|---|---|
| `NODE_ENV` | `development`, `test` o `production` |
| `PORT` | Puerto interno del backend (por defecto `3000`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciales con las que se inicializa el contenedor de PostgreSQL |
| `DATABASE_URL` | Cadena de conexión completa — el host debe ser `db` y debe coincidir con las tres variables `POSTGRES_*` de arriba |
| `SESSION_SECRET` | Cadena aleatoria de al menos 32 caracteres. Generar con: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SESSION_COOKIE_NAME` | Nombre de la cookie de sesión (por defecto `sid`) |
| `SESSION_MAX_AGE_MS` | Duración de la sesión en milisegundos (por defecto 8 horas) |
| `CORS_ORIGIN` | Origen exacto permitido para llamadas al API (ej. `http://localhost:8080` en dev) |
| `LOG_LEVEL` | Nivel de logging: `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace` |
| `LOGIN_RATE_LIMIT_WINDOW_MS` / `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` | Ventana y máximo de intentos de login por IP |
| `ACCOUNT_LOCK_MAX_FAILED_ATTEMPTS` / `ACCOUNT_LOCK_DURATION_MS` | Umbral y duración del bloqueo de cuenta |
| `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` | Usadas SOLO por `npm run seed:run` para crear el usuario administrador inicial — sin valores por defecto a propósito (ver comentario en el archivo) |
| `M365_ENCRYPTION_KEY` | Clave hex de 64 caracteres (AES-256) que cifra en reposo todos los secretos guardados en la app (M365, AD, Veeam, Vuln, Vault, SMTP, Backup Networking) — obligatoria pese al nombre histórico |

**Nunca** commitear el archivo `.env` real — está excluido en `.gitignore`.

> Manual paso a paso completo (dev y producción, con troubleshooting): [`docs/deployment.md`](docs/deployment.md).

## 4. Ejecución con Docker (recomendado)

### Desarrollo local

```bash
docker compose up --build
```

- Frontend + API: http://localhost:8080
- Backend directo (debug): http://localhost:3000
- Microservicio `netbackup-agent` (drivers Cisco/FortiGate de Backup Networking) directo: http://localhost:8001
- PostgreSQL expuesto en `localhost:5432` (solo en dev)
- El backend y `netbackup-agent` corren con recarga automática (`nodemon` / `uvicorn --reload`): los cambios en su código se aplican solos.

**Primer arranque:** después de levantar los contenedores, correr las
migraciones y el seed del usuario administrador inicial:

```bash
docker compose exec backend npm run migrate:latest
docker compose exec backend npm run seed:run
```

El usuario administrador queda creado con `ADMIN_USERNAME` /
`ADMIN_INITIAL_PASSWORD` (definidos en `.env`) y
`must_change_password = true`.

### Producción on-prem

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Antes de levantarlo:

1. Colocar los certificados TLS reales en `nginx/certs/fullchain.pem` y
   `nginx/certs/privkey.pem` (autofirmados o de tu CA interna — la carpeta
   `nginx/certs/` no se incluye en el repositorio, hay que crearla).
2. Completar `.env` con valores reales de producción (`SESSION_SECRET`
   generado específicamente para este entorno, contraseñas fuertes).

Diferencias clave frente a dev: PostgreSQL no expone su puerto al host
exterior, el backend usa la imagen multi-stage optimizada (sin
devDependencies), y nginx sirve HTTPS con redirección forzada desde HTTP.

Después del primer `up`, correr también migraciones + seed:

```bash
docker compose -f docker-compose.prod.yml exec backend npm run migrate:latest
docker compose -f docker-compose.prod.yml exec backend npm run seed:run
```

**Respaldo de base de datos:** queda fuera del alcance de este proyecto
— se resuelve a nivel de snapshot/backup de la VM completa, según lo
acordado.

## 5. Ejecución sin Docker (desarrollo puntual)

```bash
cd backend
npm install
npm run migrate:latest
npm run dev
```

Para el frontend, con hot-reload real (a diferencia de `docker compose up`,
que ahora reconstruye una imagen estática — ver sección 15):

```bash
cd frontend
npm install
npm run dev   # Vite, con proxy de /api hacia localhost:3000 (backend expuesto arriba)
```

## 6. Migraciones y seeds

```bash
cd backend
npm run migrate:latest      # aplica migraciones pendientes
npm run migrate:rollback    # revierte el último batch
npm run migrate:make nombre_migracion   # crea una nueva migración
npm run seed:run            # ejecuta los seeds (catálogo de permisos, roles, usuario admin inicial)
```

Las migraciones viven en `database/migrations/`, versionadas y ejecutadas
en orden. La migración inicial habilita la extensión `pgcrypto` de
PostgreSQL (necesaria para generar UUIDs en las tablas que se crearán en
la Fase 4 — RBAC).

## 7. Tests

```bash
cd backend
npm test              # corre una vez
npm run test:watch    # modo watch
npm run test:coverage # con reporte de cobertura
```

Los tests de integración (`tests/integration/`) corren contra una base
de datos PostgreSQL real (usan la misma `DATABASE_URL` del entorno) — no
son mocks. Requieren que la base esté accesible y migrada antes de
correrlos.

## 8. Estructura del proyecto

```
project/
├── frontend/
│   ├── index.html               # documento raíz de Vite (referencia src/main.jsx)
│   ├── Dockerfile                # build multi-stage: npm run build -> sirve con nginx
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx              # entrypoint: monta <App/> con los providers
│       ├── App.jsx               # rutas (react-router-dom) + guardas de permiso
│       ├── api/httpClient.js     # único punto que hace fetch()
│       ├── services/             # traducen operaciones de negocio a llamadas HTTP
│       ├── context/              # AuthContext, ToastContext, ConfirmContext
│       ├── components/           # DataTable, Form, Modal, Layout, Pagination (React)
│       ├── pages/                 # login, dashboard, usuarios, roles, topología...
│       ├── permissions/           # catálogo de constantes de permisos
│       ├── constants/             # constantes de dominio (ej. columnas de topología)
│       └── styles/main.css
│
├── backend/
│   ├── src/
│   │   ├── config/       # env.js (validación), database.js, logger.js, knexfile.js
│   │   ├── routes/        # ensambla los routers de cada recurso bajo /api
│   │   ├── controllers/    # (Fase 3+) delgados, delegan a services
│   │   ├── services/        # (Fase 3+) lógica de negocio
│   │   ├── repositories/     # (Fase 3+) únicas que hablan con la base de datos
│   │   ├── middleware/        # errorHandler, notFound (Fase 3+: authenticate, requirePermission)
│   │   ├── errors/              # jerarquía de errores tipados (AppError y derivados)
│   │   ├── auth/                  # (Fase 3) login, hashing, sesiones
│   │   ├── permissions/            # (Fase 4) resolución de permisos efectivos
│   │   ├── audit/                    # (Fase 7) servicio único de escritura de auditoría
│   │   └── app.js                     # ensambla Express — sin lógica de negocio
│   ├── server.js                       # arranca el servidor + apagado ordenado
│   └── tests/{unit,integration,security}/
│
├── database/
│   ├── migrations/    # versionadas, una tabla/cambio por archivo
│   └── seeds/           # (Fase 4) roles/permisos base, usuario admin inicial
│
├── nginx/
│   ├── nginx.conf         # config de desarrollo (HTTP)
│   ├── nginx.prod.conf     # config de producción (HTTPS forzado)
│   └── certs/                # certificados TLS reales (NO versionar) — crear antes de producción
│
├── docker-compose.yml         # desarrollo
├── docker-compose.prod.yml     # producción on-prem
└── .env.example
```

## 9. API

Formato de respuesta consistente en toda la API:

```jsonc
// éxito
{ "success": true, "data": { ... } }

// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

| Método | Ruta | Descripción | Permiso requerido |
|---|---|---|---|
| GET | `/api/health` | Estado de la API y conexión a base de datos | — (pública) |
| POST | `/api/auth/login` | Iniciar sesión | — (pública, con rate limit) |
| POST | `/api/auth/logout` | Cerrar sesión | Sesión válida |
| GET | `/api/auth/me` | Usuario actual + permisos efectivos | Sesión válida |
| POST | `/api/auth/change-password` | Cambiar contraseña (invalida otras sesiones) | Sesión válida |
| POST | `/api/auth/password-reset/request` | Solicitar recuperación | — (pública, con rate limit) |
| POST | `/api/auth/password-reset/confirm` | Confirmar recuperación (invalida TODAS las sesiones) | — (pública) |
| GET | `/api/users` | Listado paginado/filtrado | `users.view` |
| GET | `/api/users/:id` | Detalle de usuario | `users.view` |
| POST | `/api/users` | Crear usuario | `users.create` |
| PATCH | `/api/users/:id` | Modificar usuario | `users.update` |
| DELETE | `/api/users/:id` | Desactivar (soft delete) | `users.delete` |
| GET | `/api/roles` | Listado de roles con permisos | `roles.view` |
| GET | `/api/roles/:id` | Detalle de rol | `roles.view` |
| POST | `/api/roles` | Crear rol | `roles.create` |
| PATCH | `/api/roles/:id` | Modificar rol/permisos | `roles.update` |
| DELETE | `/api/roles/:id` | Eliminar rol (no de sistema, sin usuarios asignados) | `roles.delete` |
| GET | `/api/permissions` | Catálogo de permisos | `permissions.view` |
| GET | `/api/audit-logs` | Consulta de auditoría, filtrable | `audit.view` |
| GET | `/api/topology` | Grafo completo del mapa de topología (nodos + conexiones) | `topology.view` |
| POST | `/api/topology/nodes` | Crear nodo (app, BD, servidor, datacenter o nivel de criticidad) | `topology.edit` |
| PATCH | `/api/topology/nodes/:id` | Renombrar/editar un nodo | `topology.edit` |
| DELETE | `/api/topology/nodes/:id` | Eliminar nodo (arrastra sus conexiones) | `topology.edit` |
| POST | `/api/topology/edges` | Crear conexión entre dos nodos | `topology.edit` |
| DELETE | `/api/topology/edges/:id` | Eliminar una conexión | `topology.edit` |

Especificación completa (parámetros, schemas, ejemplos) en
[`docs/openapi.yaml`](docs/openapi.yaml).

## 10. Seguridad (resumen — ver Fase 1 para el detalle completo)

- Contraseñas: Argon2id (a partir de Fase 3, ninguna contraseña se
  almacena en texto plano).
- Sesiones: cookies `HttpOnly`, `Secure` (en producción), `SameSite`.
- CORS restringido a un único origen (`CORS_ORIGIN`), sin wildcard.
- Cabeceras de seguridad vía Helmet + nginx.
- El backend nunca es alcanzable directamente desde fuera de la red
  Docker interna — solo a través de nginx.
- Errores no operacionales (bugs) nunca exponen su mensaje real ni
  stack trace al cliente, ni siquiera en desarrollo.
- Tabla `audit_logs` (Fase 4/7) con permisos de base de datos
  restringidos a `SELECT, INSERT` para el usuario de la aplicación —
  inmutable incluso ante un bug de autorización en el código.

## 11. Gestión de usuarios, roles y permisos

- **Usuarios:** ABM completo con soft delete (`status: inactive`, nunca
  se borra físicamente). Listado con búsqueda, filtro por estado,
  ordenamiento y paginación en backend.
- **RBAC:** permisos efectivos = unión de los permisos de todos los
  roles asignados al usuario (sin permisos directos por usuario — ver
  justificación en la Fase 1). Resolución con caché de 60s, invalidada
  inmediatamente al modificar los permisos de un rol.
- **Roles de sistema:** el rol `administrator` (creado por el seed) no
  puede eliminarse. Un rol con usuarios asignados tampoco puede
  eliminarse hasta reasignarlos.
- **Primer acceso:** el usuario administrador creado por el seed tiene
  `must_change_password = true` — el frontend lo señala en el dashboard.

## 12. Auditoría

Cada acción sensible (login, logout, intentos fallidos, bloqueo de
cuenta, cambio de contraseña, ABM de usuarios, ABM de roles, cambios de
permisos) queda registrada en `audit_logs` con actor, IP, user-agent,
resultado y metadata. La tabla es **inmutable a nivel de PostgreSQL**:
un trigger rechaza cualquier `UPDATE`/`DELETE`, incluso ejecutado por el
usuario propietario de la tabla — no depende únicamente de que el
código de la aplicación se comporte correctamente.

## 13. Seguridad — puntos clave de sesión

- Sesión en cookie `HttpOnly` + `SameSite=Strict`, store en PostgreSQL
  (tabla `sessions`, gestionada vía migración).
- CSRF por double-submit cookie (`csrf_token`, header `X-CSRF-Token`) en
  toda ruta mutante.
- Cambiar la contraseña invalida cualquier OTRA sesión activa del mismo
  usuario. Confirmar recuperación de contraseña invalida TODAS las
  sesiones (no hay "sesión actual" legítima que preservar en ese flujo).
- Ver `docs/hardening-report.md` para el detalle completo de la
  revisión de seguridad, hallazgos resueltos y pendientes.

## 14. Mapa de topología

Reemplaza la versión standalone (artifact en el navegador con
`window.storage`) por un recurso **compartido por todo el equipo**,
persistido en las tablas `topology_nodes` / `topology_edges`, con la
misma sesión/CSRF/RBAC del resto del panel:

- 5 columnas: Criticidad → Aplicación → Base de Datos → Servidor/Instancia → Datacenter/Nube.
- `topology.view` para ver el mapa en solo lectura; `topology.edit` para agregar/renombrar/eliminar nodos y conexiones.
- Eliminar un nodo arrastra sus conexiones automáticamente (`ON DELETE CASCADE`).
- El seed (`04_topology.js`) carga los datos de ejemplo solo si la tabla está vacía — no pisa datos reales una vez que el equipo empieza a editar.

## 15. Frontend

React 18 + Vite (`frontend/package.json`, `frontend/vite.config.js`) +
**Tailwind CSS v4 y shadcn/ui** para la UI. `HashRouter` de
`react-router-dom` (`#/usuarios`, `#/roles`, etc.), con
`<ProtectedRoute>` por permiso (solo UX — el backend siempre revalida
cada request).

- **UI**: Tailwind v4 (CSS-first, sin `tailwind.config.js` — ver el
  `@theme inline` al inicio de `frontend/src/styles/main.css`) +
  componentes de shadcn/ui (Radix UI por debajo) en
  `frontend/src/components/ui/` — `button`, `input`, `select`,
  `checkbox`, `table`, `dialog`, `alert-dialog`, `card`, `badge`,
  `alert`, `collapsible`, `label`. Alias `@/` → `frontend/src/`
  (`vite.config.js` + `jsconfig.json`), `components.json` con la config
  del CLI (`npx shadcn@latest add <componente>` para agregar más). La
  paleta de color reutiliza la identidad previa de la app (azul como
  `--primary`) en vez del tema neutro por defecto.
- Notificaciones: `sonner` (`<Toaster/>` montado una vez en
  `main.jsx`) — se importa `{ toast } from 'sonner'` directo donde haga
  falta, sin contexto propio.
- `frontend/src/context/`: `AuthContext` (sesión, `hasPermission()`),
  `ConfirmContext` (`useConfirm()` — diálogo de confirmación con
  `Promise<boolean>`, sobre `AlertDialog` de shadcn).
- `frontend/src/components/`: `DataTable` (sobre `Table` de shadcn),
  `Form` (constructor declarativo por config de campos — **estado
  controlado**, a diferencia de la primera versión, porque `Select` y
  `Checkbox` de Radix no son elementos nativos), `Modal` (sobre
  `Dialog`), `Layout` (sidebar con secciones colapsables sobre
  `Collapsible`), `Pagination`.
- `frontend/src/lib/utils.js` (`cn()`, merge de clases) y
  `frontend/src/lib/badgeHtml.js` (badges como HTML para las celdas de
  `DataTable`, que se inyectan vía `render()` y no pueden montar un
  componente React directamente).
- `frontend/src/services/` y `frontend/src/api/httpClient.js` no
  dependen de React — son los mismos wrappers de `fetch` (sesión por
  cookie HttpOnly + CSRF por header) consumidos por los componentes.

Páginas (`frontend/src/pages/*.jsx`): login, dashboard, usuarios
(listado + alta + edición + desactivación), roles (listado + alta +
edición + asignación de permisos), auditoría (listado filtrable), mapa
de topología (dashboard visual de solo conexiones) y administración de
topología (ABM de las cajas de cada categoría), proveedores (ABM +
dashboard de solo lectura), licencias (ABM), y Microsoft 365
(configuración de conexión, licencias compradas, usuarios sincronizados
y MFA).

**Build:** `nginx` construye su imagen desde `frontend/Dockerfile`
(multi-stage: `npm ci && npm run build` con Node, resultado servido
por nginx) — tanto en `docker-compose.yml` como en
`docker-compose.prod.yml`. Como ya no hay bind mount del frontend,
hace falta `--build` para ver cambios de frontend en Docker; para
iterar con hot-reload real usar `npm run dev` (ver sección 5).

docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend npm run migrate:latest
docker compose -f docker-compose.prod.yml exec backend npm run seed:run