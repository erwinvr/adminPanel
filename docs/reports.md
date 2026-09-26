# Reportes

*Gestión → Reportes* (permiso `reports.view`) reúne reportes operativos sobre
los datos ya sincronizados. Lo que se ve en pantalla es lo que se exporta a CSV.

## Reportes disponibles (Microsoft 365)

| Reporte | Qué lista | Filtro de fecha | Parámetro |
|---|---|---|---|
| Usuarios habilitados sin MFA | Cuentas activas sin método de MFA registrado | Fecha de la última lectura de MFA | — |
| Cuentas deshabilitadas con licencia | Cuentas bloqueadas que siguen consumiendo licencias | — | — |
| Licencias compradas sin asignar | Planes con unidades libres | — | Mínimo de unidades libres; ocultar planes de más de N unidades (gratuitos) |
| Buzones cerca de la cuota | Buzones con uso ≥ umbral | Última actividad | Uso mínimo de la cuota (%, 90 por defecto) |
| OneDrive sin actividad | Cuentas sin actividad en N días | Última actividad | Días de inactividad (90) |
| Sitios de SharePoint sin actividad | Sitios sin actividad en N días | Última actividad | Días de inactividad (180) |

Los de uso (buzones, OneDrive, SharePoint) dependen de `Reports.Read.All` y de
que se haya sincronizado Microsoft 365 (ver [microsoft-365.md](microsoft-365.md)).

## Filtros

- **Buscar**: varios términos (todos deben coincidir), sin distinguir mayúsculas ni acentos.
- **Desde / Hasta** (inclusivos, `YYYY-MM-DD`): se aplican a la fecha indicada en la tabla de arriba. `desde` posterior a `hasta` se rechaza.
- Los parámetros propios de cada reporte (umbrales) se editan en pantalla.

## Exportación CSV

- El botón **Exportar CSV** exporta **todas las filas que cumplen los filtros actuales**, no solo la página visible.
- Formatos: **estándar** (coma, punto decimal) y **Excel en español** (punto y coma, coma decimal). Por defecto según el idioma del navegador.
- UTF-8 con BOM (Excel muestra bien los acentos), saltos de línea CRLF; tamaños en GB, porcentajes con 1 decimal, booleanos Sí/No.
- Protección contra inyección de fórmulas: celdas de texto que empiezan con `= + - @` se prefijan con `'`.
- Tope de 100.000 filas por exportación (se avisa con un error si se supera: acotar con filtros).
- Cada exportación queda en Auditoría como `report.export` (reporte, filtros, formato y cantidad de filas).

## API

- `GET /api/reports` — catálogo (columnas, parámetros, si admite fechas).
- `GET /api/reports/:key?page&pageSize&from&to&search&<parámetros>` — datos paginados.
- `GET /api/reports/:key/export?...&format=std|es` — descarga CSV.

## Pendiente

Envío programado por correo (se retoma después) y reportes que crucen AD ↔ M365.
