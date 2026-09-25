# Changelog

Registro de cambios de este proyecto. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

Este changelog arranca en el commit `1.4` — las versiones anteriores
(`v1`, `v1.1`, `v1.3`) no quedaron documentadas acá en detalle; para
esas, ver `git log`.

## [Unreleased]

### Corregido

- **Microsoft 365 → "Sincronizar ahora" fallaba con "Respuesta del servidor
  no válida"**: con el permiso de MFA por usuario, la sincronización tarda
  más de 5 minutos (Microsoft limita esa API a ~2-3 usuarios/s), nginx cortaba
  la petición a los 300 s (504 con HTML, que el navegador no puede
  interpretar) aunque el backend terminara. Ahora la sincronización de M365
  corre **en segundo plano** (`jobs/syncRunner.js`; `POST /m365/sync` responde
  202 al instante y `GET /m365/sync/status` informa el estado): el botón
  muestra el avance, sobrevive a recargar la página y no se pisa con la
  sincronización automática. Además la lectura de MFA es **incremental** (solo
  usuarios nunca leídos o con dato de más de 12 h, con tope de ~10 min por
  corrida; `m365_users.mfa_checked_at`) y **respeta el límite de Microsoft**
  (pausa global con `Retry-After` y concurrencia adaptativa en vez de
  insistir, que antes dejaba cientos de usuarios sin dato). Ver
  `docs/microsoft-365.md`.
- **Pantallas de configuración (AD, M365, Veeam, PAM360, Vulnerabilidades)**:
  desde el refactor de `SyncSection` el cuadro con el resultado de la
  sincronización desaparecía al terminar (solo quedaba el aviso emergente),
  porque refrescar los datos volvía a mostrar "Cargando…" y desmontaba el
  bloque. `useSettings` ahora solo muestra "Cargando…" en la primera carga.
- **Botón "Copiar" del enlace de "Compartir" y de la Bóveda**: siempre daba
  "No se pudo copiar". Causa: `navigator.clipboard` solo existe en contextos
  seguros (HTTPS o `localhost`) y el panel se sirve por HTTP en la red
  interna (`http://<ip>:8080`), donde esa API es `undefined`. Ahora
  (`lib/copyToClipboard.js`) se usa la API moderna cuando existe y, si no, se
  selecciona el campo visible y se copia con `execCommand('copy')`; si
  tampoco funcionara, el texto queda seleccionado para Ctrl+C. Verificado
  leyendo el portapapeles real desde el origen HTTP por IP y desde localhost.
- **Sincronizaciones grandes (AD, Microsoft 365, Veeam, Vulnerabilidades,
  PAM360)**: los inserts masivos iban en una sola consulta y PostgreSQL
  limita a 65.535 parámetros por consulta — la sincronización fallaba por
  completo a partir de ~5.900 usuarios de AD (o ~9.300 de M365). Ahora se
  insertan por lotes (`repositories/bulk.js`); verificado con 60.000 filas.
  El upsert de PAM360 además tolera IDs repetidos en la misma respuesta.
- **Microsoft 365 → Usuarios y MFA**: el cruce usuarios × licencias se
  hacía en memoria (O(n·m)) y bloqueaba el servidor entero: 10 s con 20.000
  usuarios, 17 s con 50.000. Las dos páginas ahora **paginan y buscan en el
  servidor** (`GET /m365/users?page&pageSize&search` + `/m365/users/summary`
  para los totales de MFA): 25 ms la primera página y ~200 ms una búsqueda
  con 53.000 usuarios. La búsqueda sigue ignorando tildes (extensión
  `unaccent`) y encontrando por nombre de licencia.
- **Microsoft 365 → MFA sin licencia adicional**: en tenants sin Entra
  ID P1/P2 la sincronización avisaba "Tenant is not a B2C tenant and
  doesn't have premium license" y no traía ningún dato de MFA (el
  reporte `userRegistrationDetails` es solo premium). Ahora, si ese
  reporte falla, se leen los **métodos de autenticación registrados de
  cada usuario** (`/users/{id}/authentication/methods`, en lotes de 20
  con reintento ante throttling) — no requiere licencia, solo agregar el
  permiso de aplicación `UserAuthenticationMethod.Read.All` en Azure AD.
  Informa "MFA registrado" y los métodos (correo, contraseña y TAP no
  cuentan); sin licencia no hay "puede autenticar con MFA", así que esa
  columna se oculta. Las cuentas deshabilitadas no se consultan. Ver
  `docs/microsoft-365.md`. Además nginx sube `proxy_read_timeout` de
  `/api/` a 300 s para que sincronizaciones largas no den 504.
- **Veeam → Configuración**: con muchos jobs en producción, la
  sincronización fallaba con "Veeam respondió con un error: HTTP 500"
  sin más detalle. Causa real (confirmada contra la spec OpenAPI del
  propio Veeam): la versión de la API que usa la app (1.2-rev0, que el
  propio Veeam marca como *deprecated*) solo sabe serializar 6 tipos de
  job; si el entorno tiene UN SOLO job de un tipo que no reconoce
  (Tape, Agent, SureBackup, CDP, Backup Copy de VM, etc. — ausentes en
  un ambiente de prueba chico), el endpoint "todos los jobs" devuelve
  error 500 y se pierde el lote completo, jobs conocidos incluidos.
  Ahora se piden los jobs **un tipo a la vez** (`typeFilter`) — un tipo
  no reconocido queda afuera de ese request puntual sin afectar a los
  demás, y si algún tipo puntual falla por otro motivo, la
  sincronización sigue con el resto y muestra qué tipo falló y por qué
  (mensaje, código de error y recurso de Veeam) en vez de abortar todo
  sin información.

### Agregado

- **"Compartir" en todos los dashboards**: además del Mapa de aplicaciones,
  Proveedores y Usuarios, ahora **Backups**, **Vulnerabilidades** y
  **Topología de Red** generan un enlace público de solo lectura (revocable,
  sin iniciar sesión), con el mismo permiso que hace falta para ver cada
  dashboard. La vista pública reutiliza el mismo componente que la
  autenticada. Ojo con el alcance: el visitante ve exactamente lo mismo que
  un usuario con permiso (nombres de equipos y parches pendientes en
  Vulnerabilidades; marca, modelo, IP de administración y subredes en
  Topología de Red).
- **Microsoft 365 → Usuarios sincronizados**: buscador por nombre, email
  o licencia (sin distinguir mayúsculas ni tildes; varios términos =
  todos deben coincidir), con contador de resultados. La columna
  "Licencias asignadas" ahora muestra el **nombre comercial** de la
  licencia en vez del código SKU (ej. "Office 365 E1" en vez de
  `STANDARDPACK`), sin repetir nombres. Se completó la tabla de nombres
  con los 19 SKU restantes del tenant, tomados de la lista oficial de
  Microsoft; la búsqueda del nombre ya no distingue mayúsculas (Graph
  manda `Win10_VDA_E3`, Microsoft publica `WIN10_VDA_E3`).
- **Microsoft 365 → filtro de dominios**: en la configuración se indican
  los dominios (del userPrincipalName) a admitir en la sincronización; el
  resto de los usuarios se ignora (vacío = todos, como antes). Se aplica
  antes de consultar el MFA, así que los usuarios ignorados no generan
  llamadas a Graph. La pantalla muestra los dominios detectados en el
  último sync con su cantidad de usuarios y si se admiten o ignoran, y el
  resultado del sync informa cuántos usuarios se ignoraron. Ver
  `docs/microsoft-365.md`.
- **Sección PAM360**: integración con ManageEngine PAM360 vía REST API
  (AUTHTOKEN), con sincronización manual y automática en segundo plano
  (igual que AD/Veeam) y un reporte **PAM360 → Solicitudes de acceso**
  (solicitante, recurso, cuenta, motivo, ventana pedida y estado, con
  búsqueda y paginación del lado del servidor). El historial se
  **acumula** en cada sync en vez de reemplazarse. Incluye un campo
  **zona horaria del servidor PAM360** porque PAM360 manda las fechas
  como hora local sin zona y el backend corre en UTC. Permisos nuevos
  `pam360.view` y `pam360.edit`. Ver `docs/pam360.md` (incluye la
  limitación: Inicio/Fin son la ventana solicitada, y la verificación
  contra un PAM360 real está pendiente).
- **Veeam → Configuración**: frecuencia de **sincronización automática
  en segundo plano** (manual / 15 min / 30 min / cada hora / 6 / 12 /
  24 h), igual que Active Directory y Microsoft 365. Las corridas
  automáticas se auditan sin usuario y con `trigger: scheduled`.
- **Active Directory → Usuarios del AD**: filtro "Solo contraseña que
  nunca expira" y columna nueva mostrando ese estado — calculado del
  bit `ADS_UF_DONT_EXPIRE_PASSWD` (0x10000) de `userAccountControl`
  en cada sync.
- **Active Directory → Administradores del AD**: página nueva que
  lista los usuarios con al menos un privilegio de administrador
  (Domain Admins, Enterprise Admins, Schema Admins o Administrators),
  incluyendo a los que lo obtienen por pertenecer a un grupo anidado
  dentro de uno de esos (búsqueda LDAP de pertenencia transitiva,
  `LDAP_MATCHING_RULE_IN_CHAIN` — no solo miembros directos). Con
  filtro por grupo armado dinámicamente a partir de los datos
  sincronizados. Es de solo lectura y no requiere delegar ningún
  permiso nuevo de AD (mismo alcance de lectura que ya usa el sync).
- **Active Directory → Equipos del AD**: página nueva que sincroniza y
  muestra los objetos "computer" del dominio (nombre, nombre DNS,
  sistema operativo, último login, estado), con filtro por sistema
  operativo armado dinámicamente a partir de los valores presentes en
  los datos sincronizados. La sincronización de equipos corre en la
  misma corrida que la de usuarios (mismo botón "Sincronizar
  ahora"/"Actualizar ahora").
- `docs/deployment.md`: manual paso a paso de despliegue en
  desarrollo y producción on-prem (variables de entorno, arquitectura
  de servicios, actualización de una instalación existente,
  resolución de problemas comunes).
- **Active Directory → Operaciones**: página nueva para ver los
  usuarios con la cuenta bloqueada y desbloquearlos desde la app —
  usa la misma cuenta de servicio configurada para el sync (LDAP
  MODIFY sobre `lockoutTime`), con dos permisos nuevos y separados
  (`AD_OPERATIONS_VIEW` para ver, `AD_OPERATIONS_UNLOCK` para
  desbloquear). Nuevo `docs/active-directory.md` documentando el
  permiso preciso de AD que necesita la cuenta de servicio ("Write
  lockoutTime") y cómo delegarlo.
- `docs/backlog.md`: features/correcciones identificadas durante el
  desarrollo y dejadas fuera de alcance a propósito (seguridad, deuda
  técnica, testing pendiente, verificación contra entornos reales).
- Botón **"Actualizar ahora"** en Active Directory → Operaciones:
  dispara una sincronización completa sin esperar la frecuencia
  automática configurada, habilitado con el mismo permiso de ver
  bloqueados (`AD_OPERATIONS_VIEW`) — no requiere `AD_EDIT`.

### Corregido

- **Veeam → Configuración**: la sincronización nunca conectaba contra
  un Veeam real. Tres causas: (1) Veeam publica su REST API (9419) con
  un certificado autofirmado que Node rechazaba
  (`DEPTH_ZERO_SELF_SIGNED_CERT`) y el mensaje solo decía "fetch
  failed" — se agrega la opción **"Verificar certificado TLS"**
  (`verify_tls`, activada por defecto) y errores con el motivo real
  (certificado, conexión rechazada, timeout, DNS); (2) el request a
  `/api/oauth2/token` ahora envía `Content-Length` explícito (con
  `Transfer-Encoding: chunked` el servidor de Veeam no responde);
  (3) el espacio libre del repositorio se guardaba vacío porque Veeam
  lo informa como `freeGB`.
- README: tabla de variables de entorno no incluía
  `M365_ENCRYPTION_KEY` (obligatoria); sección de Docker no mencionaba
  el servicio `netbackup-agent`.

### Cambiado

- **Refactor de código compartido**: cliente HTTPS común para Veeam y PAM360
  (`integrations/http/httpsRequest.js`); en el frontend, `SyncSection`
  (bloque de sincronización), `useSettings`, `usePagedList` y
  `formatDateTime` reemplazan copias repetidas — las 5 pantallas de
  configuración pasan de ~776 a ~490 líneas y Auditoría/PAM360 usan el mismo
  hook de lista paginada. Sin cambios de comportamiento.
- **Compresión gzip** en nginx (JSON, JS, CSS, SVG): las listas grandes y el
  bundle viajan 5-10 veces más chicos.
- **Backup Networking → almacenamiento de configuraciones**: cada corrida
  guardaba la configuración completa aunque no hubiera cambiado (medido:
  3.465 corridas, 5 configuraciones distintas, 12 MB). Ahora hay una fila por
  configuración distinta (`netbackup_configs`, por dispositivo + hash
  normalizado) y cada corrida la referencia: **12 MB → ~1 MB** y el
  crecimiento pasa a depender de cuántas veces cambia una configuración, no
  de cuántos backups se hacen. Se conserva el texto de la primera vez que se
  vio cada configuración (las corridas repetidas solo difieren en líneas
  volátiles como el timestamp del export). Migración reversible; ver
  `docs/deployment.md` (`VACUUM FULL` una vez) — Bitácora, historial,
  compliance y topología dan el mismo resultado.
- **Índices** para volúmenes altos: Auditoría por módulo
  (`action text_pattern_ops` + fecha; las consultas de módulo usan `LIKE` de
  prefijo en vez de `ILIKE`: el conteo con 1,5 M de eventos bajó de 1.625 ms
  a 141 ms), claves foráneas inversas (`m365_user_licenses.m365_license_id`,
  `user_roles.role_id`, `role_permissions.permission_id`) y ordenamiento de
  usuarios de M365/AD. Se crean con `CONCURRENTLY` (sin bloquear escrituras).
- **Auditoría dividida por módulo**: la página "Auditoría" pasa a
  llamarse **Aplicación** y muestra solo los eventos de la aplicación
  (usuarios, roles, sesiones, ABM, etc.); se agregan páginas
  independientes para **Microsoft 365**, **Active Directory**,
  **Veeam**, **Vulnerabilidades** y **PAM360**, cada una con solo sus
  eventos y el mismo filtro y paginación. El endpoint
  `GET /audit-logs` acepta un parámetro `module` (por defecto
  `application`); el reparto se hace por prefijo de acción
  (`backend/src/audit/auditModules.js`). Backup Networking sigue sin
  listarse. Mismo permiso `audit.view` para todas.
- El scheduler de sincronizaciones automáticas (AD, Microsoft 365,
  Veeam) ya no reintenta cada minuto cuando una corrida falla: una
  falla no actualizaba `last_synced_at`, así que se reintentaba en cada
  tick y dejaba un evento de fallo por minuto en `audit_logs`
  (inmutable). Ahora espera el intervalo configurado entre intentos.
- La página de Auditoría ya no muestra eventos de Backup Networking
  (`netbackup.*` — dispositivos, corridas, reglas de compliance); esa
  sección queda solo para eventos de seguridad. La tabla `audit_logs`
  es inmutable por diseño (trigger de PostgreSQL que rechaza
  UPDATE/DELETE), así que los eventos ya guardados no se borraron —
  se excluyeron de la consulta que alimenta esta página.

## [1.4] - 2026-09-06

### Agregado

- Sección **Configuración → SMTP**: servidor de correo saliente
  configurable, con envío de correo de prueba.
- **"Olvidé mi contraseña"** en el login: genera una contraseña
  temporal y la envía por correo; obliga a cambiarla en el primer
  inicio de sesión.
- **Backup Networking multi-driver**: soporte para Cisco IOS/IOS-XE
  (NAPALM) y FortiGate/FortiOS (API REST), además del driver genérico
  por SSH — resuelto vía un microservicio Python nuevo
  (`netbackup-agent`).
- **Compliance de Backup Networking**: reglas de texto/regex
  evaluadas automáticamente contra la configuración de cada
  dispositivo tras cada backup, con resumen por equipo y detalle por
  regla.
- **Normalización de hash de configuración**: ignora líneas
  volátiles (timestamp/contador de guardado que cada fabricante mete
  en el header) para no contar un backup idéntico como una versión
  nueva.
- **Bitácora**: la grilla de versiones muestra solo las corridas
  donde cambió la configuración; el comparador de versiones ahora
  muestra dos cuadros lado a lado con las diferencias resaltadas
  (antes era un único bloque unificado).
- **Dashboard "Topología de Red"**: grafo de interconexión inferida
  entre equipos de networking marcados en el inventario, a partir de
  subredes IP compartidas en sus configs respaldadas — corroborado
  contra la tabla de ruteo de cada equipo para reducir falsos
  positivos (dos equipos compartiendo un rango privado por
  convención, sin estar realmente conectados).
- Campos **"IP de administración"** e **"Incluir en Topología de
  Red"** en el inventario de Hardware.
- **Paginación de 10 resultados por página** en todas las grillas de
  la aplicación.

### Corregido

- El filtro de búsqueda de Auditoría usaba comparación exacta en vez
  de "contiene" (buscar "auth" no encontraba "auth.login").
- Falso positivo de "usuario/email duplicado" al editar cualquier
  usuario — bug de precedencia de operadores en la consulta SQL
  (`OR`/`AND` sin agrupar).
- Scrollbar fantasma en el modal de edición de permisos de roles
  (bug de cálculo de `scrollHeight` en Chromium con overflow
  anidado).
- Los checkboxes de formularios no respetaban `disabled`/
  `enabledWhen` — afectaba a cualquier campo checkbox condicional de
  toda la aplicación, no solo a los nuevos.
