# Changelog

Registro de cambios de este proyecto. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

Este changelog arranca en el commit `1.4` — las versiones anteriores
(`v1`, `v1.1`, `v1.3`) no quedaron documentadas acá en detalle; para
esas, ver `git log`.

## [Unreleased]

### Corregido

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
