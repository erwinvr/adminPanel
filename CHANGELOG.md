# Changelog

Registro de cambios de este proyecto. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

Este changelog arranca en el commit `1.4` — las versiones anteriores
(`v1`, `v1.1`, `v1.3`) no quedaron documentadas acá en detalle; para
esas, ver `git log`.

## [Unreleased]

### Agregado

- **Dashboard "Servicios M365" → sección "Sincronización desde Active
  Directory on-premises"**: cuántas cuentas hay en total, cuántas vienen
  sincronizadas desde un AD on-premises vía Entra Connect vs. nativas de
  la nube, y el desglose por cada dominio on-premises (`onPremisesDomainName`).
- **Sincronización de Microsoft 365 trae los atributos on-premises**: para
  cuentas sincronizadas desde un Active Directory on-premises vía Entra
  Connect (null en cuentas nativas de la nube) — dominio
  (`onPremisesDomainName`), DN, sAMAccountName y UPN que tenía en el AD
  on-premises, y si la sincronización está habilitada
  (`onPremisesSyncEnabled`). 5 columnas nuevas en `m365_users`, visibles
  en el reporte "Usuarios de Microsoft 365 (todos los atributos)". Quedan
  null hasta la próxima sincronización.
- **Reportes → "Usuarios de Microsoft 365 (todos los atributos)"**: nuevo
  reporte con el listado completo de usuarios de M365 (nombre, UPN,
  dominio, ID de Azure AD, atributos on-premises, habilitada, MFA
  registrado/capaz, métodos de MFA, último chequeo de MFA, licencias y
  última sincronización) — antes solo existían reportes de subconjuntos
  filtrados (sin MFA, deshabilitados con licencia).

### Cambiado

- **Reportes → "Usuarios de Active Directory" pasa a "...(todos los
  atributos)"**: antes solo exportaba nombre, correo, usuario, fecha de
  creación y estado; ahora también incluye DN, bloqueo (y su fecha),
  contraseña sin vencimiento (y fecha del último cambio), último inicio de
  sesión, grupos privilegiados y última sincronización — y ahora tiene
  buscador por nombre/correo/usuario. Mismas filas que antes (todos los
  usuarios de AD, sin filtro), solo con más columnas.

- **Mapa de Aplicaciones: se dibuja por contención, no por 5 columnas
  planas ni por una lista de Aplicación aparte.** Ahora es un solo árbol:
  *Datacenter / Nube* contiene sus Servidor / Instancia (y, directo, sus
  Bases de Datos sin Servidor de por medio), y cada Servidor contiene las
  Bases de Datos y Aplicaciones conectadas DIRECTO a él (con un punto de
  color como ícono de Criticidad) — así se ve de un vistazo dónde vive
  cada cosa. Una Aplicación **sin ninguna conexión directa a un Servidor
  no aparece en el mapa** (sigue existiendo: se ve en "Administrar cajas"
  y se le pueden crear conexiones desde cualquier otra caja). Una
  Aplicación NUNCA se anida directo en un Datacenter (sin un Servidor de
  por medio no es una ubicación física real) ni por usar una Base de
  Datos que esté ahí — "usa" (Aplicación → Base de Datos) se dibuja como
  línea entre dondequiera que haya quedado cada caja, nunca como
  contención (si la Aplicación no aparece en ningún lado, tampoco hay
  línea). La conexión directa Aplicación↔Datacenter/Nube ya no se puede
  crear (ni se ofrece en "editar conexiones" ni la acepta el backend) —
  nunca es una relación real, siempre es a través de un Servidor/
  Instancia. Una Base de Datos, un Servidor o una Aplicación pueden
  aparecer repetidos si tienen más de una conexión directa (ej. una BD en
  dos Servidores). Los Datacenter/Nube se ubican uno al lado del otro
  (horizontal), no apilados. El modelo de datos no cambió — "editar conexiones"
  (⇄) sigue siendo la única forma de decir dónde vive o qué usa cada
  caja.
- **Servidor / Instancia tiene un atributo "Dirección IP"** (opcional,
  valida formato de IP), editable desde "Administrar cajas" y visible en
  el mapa y en el panel de información — solo para esa categoría.

### Corregido

- **Mapa de Aplicaciones: la línea "usa" entre una Aplicación y su Base
  de Datos se desviaba hacia afuera antes de conectar**, en vez de ir
  directo entre las dos cajas, cuando quedaban casi a la misma altura en
  Datacenter/Nube distintos (ej. una Aplicación en un Datacenter
  ubicado a la izquierda del de su Base de Datos). Cada caja tenía un
  único punto de conexión fijo (siempre sale por la derecha, siempre
  entra por la izquierda) sin importar dónde terminó ubicada la otra
  punta — y los Datacenter se ordenan según los datos, no según qué
  conexiones "usa" hay entre lo que contienen, así que ese desvío era
  inevitable con datos reales. Ahora cada línea calcula, para las dos
  cajas que une, por qué lado de cada una entrar/salir según su
  posición real en el lienzo.

### Agregado

- **"Administrar cajas" (Aplicaciones) → buscador por nombre**, y **alta
  masiva por CSV**: "Descargar plantilla" baja un CSV con las columnas
  esperadas (Categoría, Nombre, Criticidad, Detalle, Dirección IP, Color) y
  un ejemplo por categoría; "Importar" sube un CSV con ese formato y crea
  las cajas. Solo crea — una fila con la misma categoría y nombre que una
  caja ya existente se cuenta como omitida y no se pisa. La columna
  "Criticidad" (solo para filas de Aplicación) conecta la app nueva con el
  nivel de Criticidad ya existente con ese nombre — no crea niveles
  nuevos; las demás conexiones (en qué Servidor vive, qué Base de Datos
  usa) se siguen cargando desde "editar conexiones" en el mapa. Cada fila
  inválida (categoría no reconocida, color/IP con formato inválido, nivel
  de Criticidad que no es uno de los 4 fijos, que ya existe o que todavía
  no se creó) se reporta con su número de fila sin bloquear al resto del
  archivo.

### Corregido

- **UEM (Endpoint Central) → la sincronización decía "éxito" con 0 equipos
  aunque el API key o la conexión fallaran**: Endpoint Central devuelve
  HTTP 200 incluso cuando rechaza el pedido (el error va en el cuerpo);
  ahora se revisa y, si falla, el sync queda registrado como error con el
  motivo real en vez de "0 equipos, éxito". Además se corrigieron dos
  errores que impedían traer datos aun con un API key válido: la lista de
  equipos venía en `message_response.allsystems`, no `allsystemsview` como
  asumía el código; y "parches pendientes" no es un solo campo sino la
  suma de Microsoft/terceros/driver/BIOS, con `"--"` en vez de `0` cuando
  el equipo nunca se escaneó. Confirmado contra un servidor real. Ver
  [docs/uem.md](docs/uem.md).

- **Dashboard "Servicios M365" mostraba usuarios y sitios de dominios no
  admitidos**: el filtro de dominios de *Microsoft 365 → Configuración* solo
  se aplicaba al guardar el informe de uso durante la sincronización; si los
  dominios se cambiaban después (o la última foto era de antes del filtro),
  el dashboard seguía mostrando datos de dominios ya no permitidos hasta el
  siguiente sync. Ahora el filtro también se aplica al leer (buzones,
  OneDrive, Teams por usuario y sitios de SharePoint con propietario
  resoluble), con la configuración de dominios **actual**, así que el
  dashboard siempre queda consistente con lo configurado sin esperar una
  sincronización. Ver [docs/microsoft-365.md](docs/microsoft-365.md).
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

### Corregido

- **Reportes → el botón "Limpiar filtros" aparecía incluso en reportes sin
  ningún filtro** (ej. "Usuarios de Active Directory"): ahora solo se muestra
  cuando el reporte tiene búsqueda, fechas o parámetros.

### Agregado

- **5 reportes de UEM** en *Reportes*: equipos con parches pendientes,
  equipos con parches críticos pendientes, equipos sin escanear, equipos
  con el agente sin contacto, y cobertura del agente por sistema operativo
  (la misma tabla del gráfico del dashboard UEM, exportable). El sync de
  UEM ahora también guarda el último escaneo exitoso, el último contacto
  del agente y el desglose de parches críticos/importantes (campos que
  Endpoint Central ya entregaba y no se guardaban). Ver
  [docs/uem.md](docs/uem.md).
- **UEM → Configuración ahora tiene sincronización automática** (mismo
  campo de frecuencia que Active Directory / Microsoft 365: manual, cada
  15/30/60 min, 6/12/24 h), sin perder el botón "Sincronizar ahora". El
  job en segundo plano (`syncScheduler.js`) ya revisa UEM junto con las
  demás integraciones.
- **El dashboard "Usuarios" se renombró a "Active Directory"** y suma un
  gráfico nuevo: **Top 10 — equipos sin autenticar (90+ días)**, mismo
  criterio que ya existía para usuarios (días desde el último login en
  Active Directory, "Nunca" para los que no tienen registro).
- **"Vulnerabilidades" se renombró a "UEM"** (dashboard y sección de
  configuración, incluido el submenú de Auditoría) para reflejar mejor
  qué es: gestión unificada de endpoints con ManageEngine Endpoint
  Central, no solo vulnerabilidades. El dashboard UEM ahora también
  muestra **cobertura del agente**: equipos en el dominio (Active
  Directory) vs. equipos con el agente de Endpoint Central instalado,
  agrupados por sistema operativo — la familia del SO ("Windows Server
  2022" vs. "Windows 10/11") distingue servidores de equipos de usuario.
  Ver [docs/uem.md](docs/uem.md).
- **Reporte "Usuarios de Active Directory"**: nombre, correo, usuario, fecha
  de creación y estado de cada cuenta sincronizada, sin filtros, exportable a
  CSV. La sincronización de AD ahora también lee el atributo `mail` (antes no
  se pedía); en cuentas ya sincronizadas el correo queda vacío hasta la
  próxima sincronización.
- **Reportes de backups exitosos**: "Backups de networking exitosos" (una fila por
  ejecución exitosa, filtrable por rango de fechas y exportable a CSV) y "Jobs
  de Veeam con última ejecución exitosa" (Veeam solo entrega la última
  ejecución por job, no el historial). Ver [docs/reports.md](docs/reports.md).
- **Sección Reportes** (*Gestión → Reportes*, permiso nuevo `reports.view`,
  incluido en `administrator` tras `seed:run`): 6 reportes de Microsoft 365
  (usuarios habilitados sin MFA, cuentas deshabilitadas con licencia,
  licencias sin asignar, buzones cerca de la cuota, OneDrive y sitios de
  SharePoint sin actividad). Filtro por rango de fechas, búsqueda y umbrales
  ajustables; **el botón "Exportar CSV" descarga todo lo que cumple los filtros
  en pantalla** (formato estándar o Excel en español, UTF-8 con BOM, defensa
  contra inyección de fórmulas, tope de 100.000 filas). Cada exportación
  queda en Auditoría (`report.export`). API `GET /api/reports[/:key[/export]]`.
  El envío programado por correo queda para una etapa posterior. Ver
  [docs/reports.md](docs/reports.md).
- **Dashboard → Servicios M365**: página nueva con el uso de **correo,
  OneDrive, SharePoint y Teams** de Microsoft 365, con totales y un top 10 de
  cada uno: los usuarios con el buzón más lleno y con el OneDrive más
  utilizado (usado, cuota/asignado, % usado con colores de estado), los sitios
  de SharePoint con más almacenamiento (y cuántos llevan más de 180 días sin
  actividad) y, en Teams, equipos públicos/privados, usuarios activos,
  mensajes, reuniones, llamadas y los usuarios y equipos más activos de los
  últimos 30 días. Usa los informes de uso de Microsoft Graph (permiso
  `Reports.Read.All`, sin licencia adicional), que Microsoft actualiza una vez
  por día y con atraso — cada tarjeta muestra la fecha del informe. Se
  refrescan como máximo cada 6 h dentro de la sincronización de M365, cada
  informe por separado (si uno falla —ej. el de equipos, que solo existe en la
  API *beta*— los demás se guardan y la sincronización sigue), y se pueden
  **compartir** con enlace público. Ver `docs/microsoft-365.md`. También: el
  encabezado de las páginas con botón "Compartir" quedaba pegado al texto de
  ayuda.
- **Microsoft 365 → MFA de usuarios**: filtro por estado de MFA — *Todos*,
  *Solo con MFA registrado*, *Solo sin MFA registrado* y *Sin datos de MFA*
  (cuentas deshabilitadas o aún no leídas). Se resuelve en el servidor
  (`GET /m365/users?mfa=registered|missing|unknown`), así que se combina con
  la búsqueda y la paginación y muestra el total de resultados.
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

### Seguridad

- **Login: dos canales que permitían distinguir "usuario no existe" de
  "existe pero está bloqueado/inactivo"**. El hash "señuelo" (que
  absorbe el tiempo de verificar una contraseña real) antes solo se
  corría en la rama "usuario no existe"; ahora se corre también
  cuando la cuenta está bloqueada o inactiva, así el tiempo de
  respuesta no delata cuál de los tres casos es. Además, "cuenta
  bloqueada" devolvía un mensaje distinto al resto
  ("bloqueada temporalmente por múltiples intentos fallidos"); ahora
  usa el mismo mensaje genérico que cualquier credencial inválida — el
  motivo real sigue quedando en el evento de auditoría. Por separado,
  el contador de intentos fallidos que dispara el bloqueo no se estaba
  persistiendo al bloquear la cuenta (`lockUntil` no lo guardaba),
  así que se perdía apenas la cuenta quedaba bloqueada.

### Corregido

- **Sincronización manual y automática de una misma integración podían
  pisarse** (AD, Veeam, PAM360, UEM/Vulnerabilidades, y cada
  dispositivo de Backup Networking): el botón "Sincronizar ahora" de
  cada pantalla de Configuración llamaba al servicio directo, sin
  pasar por el seguimiento que ya usa el scheduler automático
  (`jobs/syncRunner.js`) — dos sesiones (ej. una conexión SSH a un
  mismo dispositivo) podían correr en paralelo. Ahora los 5 controllers
  usan el mismo seguimiento que el scheduler y la corrida manual
  responde 409 si ya hay una en curso.
- **Backup Networking: una falla al evaluar las reglas de compliance
  después de un backup exitoso podía dejar la corrida marcada como
  fallida pese a haber funcionado**. La evaluación de compliance
  corría dentro del mismo `Promise.all` que grababa el resultado del
  backup; si tiraba una excepción (ej. una regla con una expresión
  regular inválida), el `catch` de más arriba volvía a escribir
  `result: 'failure'` sobre la misma corrida que un instante antes se
  había marcado `'success'` — una carrera con resultado final no
  determinístico y dos eventos de auditoría contradictorios para la
  misma corrida. Ahora la evaluación de compliance corre después, y si
  falla solo queda en el log del proceso; el resultado del backup ya
  quedó grabado.
- **Doble fila al guardar la configuración de una integración por
  primera vez** (AD, M365, Veeam, PAM360, UEM, SMTP): guardar eran un
  "leer, después insertar o actualizar"; dos guardados casi
  simultáneos (doble clic, reintento del frontend) podían ver los dos
  "no existe todavía" y terminar insertando dos filas en una tabla
  pensada para tener una sola. Ahora el guardado toma un lock de
  Postgres por tabla mientras dura, sin necesitar una migración nueva.
  Probado con 10 guardados concurrentes contra una tabla de prueba:
  antes de la corrección insertaba varias filas, con la corrección
  queda siempre una.
- **Microsoft Graph o Veeam respondiendo sin cuerpo JSON (o con uno
  vacío) podía tumbar la sincronización con un error no controlado**
  (`TypeError: Cannot read properties of null`) en vez de un error
  claro de la integración. Pasa en cortes de red a mitad de respuesta
  o mantenimientos del lado del proveedor; ahora esos casos tiran un
  error propio de la integración con un mensaje entendible.

### Cambiado

- **Refactor de código compartido, sin cambios de comportamiento**:
  `createSettingsController` reemplaza el `getSettings`/`saveSettings`
  copiado en los 6 controllers de integraciones (AD, M365, Veeam,
  PAM360, UEM, SMTP); un helper de paginación (`repositories/pagination.js`)
  y un fragmento de validación (`validators/pagination.js`) reemplazan
  el `LIMIT/OFFSET` y el esquema `page`/`pageSize` duplicados en los 4
  listados paginados del lado del servidor (usuarios, auditoría,
  usuarios de M365, solicitudes de acceso de PAM360) — de paso, el
  `pageSize` por defecto de usuarios de M365 pasa de 10 a 20 para que
  los 4 queden iguales.
- **Inventario de hardware (crear/editar) ya no vuelve a traer toda la
  tabla para devolver la fila recién creada/editada** — usaba
  `listItems()` completo y buscaba el id en memoria; ahora una
  consulta trae solo esa fila. Al crear un ítem, la validación de
  oficina y de proveedor de soporte corre en paralelo en vez de una
  después de la otra.

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
