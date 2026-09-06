# Changelog

Registro de cambios de este proyecto. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

Este changelog arranca en el commit `1.4` — las versiones anteriores
(`v1`, `v1.1`, `v1.3`) no quedaron documentadas acá en detalle; para
esas, ver `git log`.

## [Unreleased]

### Agregado

- `docs/deployment.md`: manual paso a paso de despliegue en
  desarrollo y producción on-prem (variables de entorno, arquitectura
  de servicios, actualización de una instalación existente,
  resolución de problemas comunes).

### Corregido

- README: tabla de variables de entorno no incluía
  `M365_ENCRYPTION_KEY` (obligatoria); sección de Docker no mencionaba
  el servicio `netbackup-agent`.

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
