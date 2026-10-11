# UEM (ManageEngine Endpoint Central)

*UEM → Configuración* guarda la URL del servidor, un API key (Admin →
API Key Generation en Endpoint Central) y la frecuencia de
sincronización automática (igual que Active Directory / Microsoft 365;
0/manual la desactiva — `vuln_settings.sync_interval_minutes`, revisado
por `jobs/syncScheduler.js`), además del botón "Sincronizar ahora" de
siempre. *Dashboard → UEM* muestra, por equipo, la cantidad de parches
pendientes (`vuln_computers.pending_patches_count`) y la cobertura del
agente (ver abajo).

## Particularidades de la API de Endpoint Central (REST 1.4)

Confirmado contra un servidor real (2026-10-10) — antes de esto, el
cliente (`integrations/endpointCentral/endpointCentralClient.js`) se
había escrito a partir de la documentación, sin probarlo contra un
servidor real, y tenía dos bugs que hacían que el sync terminara
"exitoso" con 0 equipos:

- **Devuelve HTTP 200 incluso cuando rechaza el pedido.** El error va
  en el cuerpo: `{"status":"error","error_code":"1010","error_description":
  "User is not authorized to access this API"}` (API key sin el permiso de
  esa API puntual) o `error_code: "10002"` ("Invalid or expired token").
  Hay que revisar `body.status`, no solo el código HTTP — si no, un
  API key mal configurado se interpreta como "0 equipos", no como un
  error.
- **La lista de equipos de `patch/allsystems` queda en
  `message_response.allsystems`** (no `allsystemsview`, que es lo que
  decía la documentación a mano que se había usado originalmente).
- **No hay un solo campo de "parches faltantes"**: viene separado por
  tipo — `missing_ms_patches` (Microsoft), `missing_tp_patches`
  (terceros), `missing_driver_patches`, `missing_bios_patches` — y se
  suman para `pending_patches_count`.
- **Los campos numéricos vienen como el string `"--"`** (no `0` ni
  `null`) cuando el equipo nunca se escaneó o ese tipo de parche no
  aplica — `Number("--")` da `NaN`, hay que tratarlo como 0
  (`toCount()` en `vuln.service.js`). Importante: un equipo con
  `pending_patches_count: 0` puede significar "sin parches
  pendientes" **o** "nunca escaneado" — el esquema actual no guarda el
  estado del escaneo para distinguirlos.
- El servidor de prueba resultó **inestable** bajo pedidos seguidos
  (`ECONNRESET`, `504 Gateway Timeout` ocasionales) — no es un bug de
  esta app, pero conviene tenerlo en cuenta si un sync falla una vez:
  reintentar.

## Cobertura del agente (equipos del dominio vs. con el agente instalado)

El dashboard cruza `ad_computers` (foto del último sync de Active
Directory) con `vuln_computers` (foto del último sync de Endpoint
Central), agrupando por **familia de sistema operativo** —
`agentCoverageByOs()` en `repositories/vuln.repository.js`. La familia
normaliza el nombre de SO de ambas fuentes (que lo describen con
distinto nivel de detalle, ej. AD da "Windows Server 2022 Standard" y
Endpoint Central da "Windows Server 2022 Standard Edition (x64)") a
una etiqueta corta y comparable: "Windows Server 2022", "Windows 10",
"Linux", etc. Que la etiqueta diga "Server" o no es justamente lo que
distingue servidores de equipos de usuario en el gráfico.

No es un cruce por identidad (mismo equipo en ambos lados) — son dos
conteos independientes por familia de SO, así que no hace falta que
los nombres de equipo coincidan entre AD y Endpoint Central para que
el gráfico tenga sentido (típicamente no coinciden 1 a 1: AD tiene
equipos que nunca llevaron el agente, y el agente puede estar en
equipos fuera del dominio).

## Reportes de UEM (sección Reportes)

*Reportes* tiene 5 reportes de UEM (ver [reports.md](reports.md)):
equipos con parches pendientes, equipos con parches críticos
pendientes, equipos sin escanear, equipos con el agente sin contacto, y
la cobertura del agente por SO (la misma tabla del gráfico del
dashboard, exportable). "Sin escanear"/"sin contacto" usan
`last_successful_scan` y `agent_last_contact_time` — un equipo que
nunca escaneó o nunca contactó cuenta como el caso más urgente
(`NULL` encabeza el ranking, igual que "Nunca" en los reportes de AD).

No se usó `computer_live_status` (agente online/offline "en vivo")
para el reporte de "sin contacto": ManageEngine no documenta
públicamente sus valores posibles, así que se prefirió el timestamp de
último contacto — objetivo, sin ambigüedad de interpretación — sobre
un código de estado que podría leerse mal.

## Otros datos disponibles en `patch/allsystems` (no usados hoy)

Por equipo, además de lo que ya se guarda (nombre, parches pendientes,
`os_name`, escaneo, contacto del agente, parches críticos/importantes):
`ip_address`, `mac_address`, `domain_netbios_name`, `fqdn_name`,
`agent_logged_on_users`, `branch_office_name`, `scan_remarks`,
`computer_live_status` (agente online/offline — ver nota arriba),
`resource_health_status`, y el desglose de severidad
`moderate_patch_count` / `low_patch_count`. Se podría ampliar el
dashboard/los reportes con esto si hace falta.

## Otros endpoints de Patch Management (existen en este servidor, no se usan)

`patch/allpatches` (catálogo de parches conocidos), `patch/missingpatches`
(detalle de qué parche falta en qué equipo), `patch/supportedpatches`
(catálogo soportado) e `inventory/installedsoftware` (software instalado
por equipo) — devuelven la misma forma de error si el API key no tiene el
permiso de esa API puntual.

Este servidor **no tiene** los módulos de Inventario de hardware
(`inventory/scannedsystems`, etc.), gestión de clientes (`ccm/*`) ni
Vulnerability Manager Plus (`vulnerability/*`): esas rutas devuelven
`404 "is an invalid URL"` (no existen en esta instalación, no es un
tema de permisos).
