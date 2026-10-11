/**
 * reports/reportCatalog.js
 *
 * Definición de cada reporte de la sección "Reportes". Un reporte es una
 * consulta SQL sobre datos ya sincronizados (no llama a ningún sistema
 * externo) más la descripción de sus columnas, que sirve tanto para dibujar
 * la tabla en pantalla como para armar el CSV con LAS MISMAS columnas.
 *
 *  - `dateLabel` / `dateExpression`: la fecha sobre la que actúa el filtro
 *    Desde/Hasta (ej. "Última actividad"). Sin ellas, el reporte es una foto
 *    del último sync y no muestra filtro de fechas.
 *  - `params`: umbrales propios del reporte (ej. % mínimo de uso).
 *  - `searchColumns`: columnas de texto donde busca el buscador (sin
 *    distinguir mayúsculas ni tildes); sin ellas no hay buscador.
 *  - `columns[].type`: text | number | bytes | percent | date | bool.
 *  - `build(params)`: knex query builder SIN ejecutar, con `select` cuyos alias
 *    son las `key` de las columnas. `orderBy`: orden estable de las filas.
 *  - `mapRow(row)` (opcional): ajuste en JS (ej. nombre comercial de licencia).
 */

import { db } from '../config/database.js';
import { friendlySkuName } from '../integrations/microsoft365/skuNames.js';
import { vulnRepository } from '../repositories/vuln.repository.js';

const day = (column, alias) => db.raw(`to_char(${column}, 'YYYY-MM-DD') as "${alias}"`);

// SKU (código) separados por coma → nombres comerciales, ej. "Office 365 E1, Power BI (gratis)"
const friendlyLicenses = (skus) =>
  skus
    ? skus
        .split(',')
        .map(friendlySkuName)
        .join(', ')
    : '';

const licensesOf = (alias) =>
  db.raw(
    `(select string_agg(l.sku_part_number, ',' order by l.sku_part_number)
        from m365_user_licenses ul join m365_licenses l on l.id = ul.m365_license_id
       where ul.m365_user_id = ${alias}.id) as "licenses"`
  );

const userColumns = [
  { key: 'displayName', label: 'Nombre', type: 'text' },
  { key: 'userPrincipalName', label: 'Correo', type: 'text' },
  { key: 'domain', label: 'Dominio', type: 'text' },
];

export const REPORTS = [
  {
    key: 'm365-users-without-mfa',
    title: 'Usuarios habilitados sin MFA',
    description:
      'Cuentas habilitadas de Microsoft 365 que NO tienen registrado ningún método de segundo factor. La fecha filtra por el último chequeo de MFA de cada usuario.',
    source: 'Microsoft 365',
    dateLabel: 'Último chequeo de MFA',
    dateExpression: 'u.mfa_checked_at::date',
    params: [],
    searchColumns: ['u.display_name', 'u.user_principal_name'],
    columns: [...userColumns, { key: 'licenses', label: 'Licencias', type: 'text' }, { key: 'checkedAt', label: 'Último chequeo de MFA', type: 'date' }],
    build: () =>
      db('m365_users as u')
        .where('u.account_enabled', true)
        .where('u.is_mfa_registered', false)
        .select('u.display_name as displayName', 'u.user_principal_name as userPrincipalName', db.raw(`split_part(u.user_principal_name, '@', 2) as "domain"`), licensesOf('u'), day('u.mfa_checked_at', 'checkedAt')),
    orderBy: [{ column: 'displayName' }, { column: 'userPrincipalName' }],
    mapRow: (r) => ({ ...r, licenses: friendlyLicenses(r.licenses) }),
  },
  {
    key: 'm365-disabled-with-license',
    title: 'Cuentas deshabilitadas con licencia',
    description: 'Cuentas deshabilitadas de Microsoft 365 que todavía tienen licencias asignadas: se puede recuperar la licencia.',
    source: 'Microsoft 365',
    dateLabel: null,
    params: [],
    searchColumns: ['u.display_name', 'u.user_principal_name'],
    columns: [...userColumns, { key: 'licenses', label: 'Licencias asignadas', type: 'text' }, { key: 'licenseCount', label: 'Cantidad', type: 'number' }],
    build: () =>
      db('m365_users as u')
        .where('u.account_enabled', false)
        .whereExists(db('m365_user_licenses as x').whereRaw('x.m365_user_id = u.id').select(db.raw('1')))
        .select(
          'u.display_name as displayName',
          'u.user_principal_name as userPrincipalName',
          db.raw(`split_part(u.user_principal_name, '@', 2) as "domain"`),
          licensesOf('u'),
          db.raw('(select count(*) from m365_user_licenses x where x.m365_user_id = u.id) as "licenseCount"')
        ),
    orderBy: [{ column: 'displayName' }, { column: 'userPrincipalName' }],
    mapRow: (r) => ({ ...r, licenses: friendlyLicenses(r.licenses) }),
  },
  {
    key: 'm365-unassigned-licenses',
    title: 'Licencias compradas sin asignar',
    description: 'Licencias de Microsoft 365 con unidades disponibles (compradas menos asignadas), de mayor a menor.',
    source: 'Microsoft 365',
    dateLabel: null,
    params: [
      { name: 'minFree', label: 'Mínimo de unidades libres', type: 'number', default: 1, min: 1, max: 1000000000 },
      { name: 'maxTotal', label: 'Ocultar planes de más de N unidades (gratuitos)', type: 'number', default: 100000, min: 1, max: 1000000000 },
    ],
    columns: [
      { key: 'name', label: 'Licencia', type: 'text' },
      { key: 'sku', label: 'SKU', type: 'text' },
      { key: 'total', label: 'Compradas', type: 'number' },
      { key: 'assigned', label: 'Asignadas', type: 'number' },
      { key: 'free', label: 'Libres', type: 'number' },
      { key: 'pctUsed', label: '% en uso', type: 'percent' },
    ],
    build: ({ minFree, maxTotal }) =>
      db('m365_licenses as l')
        .whereRaw('l.enabled_units - l.consumed_units >= ?', [minFree])
        .whereRaw('l.enabled_units <= ?', [maxTotal])
        .select(
          'l.sku_part_number as sku',
          'l.enabled_units as total',
          'l.consumed_units as assigned',
          db.raw('l.enabled_units - l.consumed_units as "free"'),
          db.raw('case when l.enabled_units > 0 then round(l.consumed_units * 100.0 / l.enabled_units, 1) end as "pctUsed"')
        ),
    orderBy: [{ column: 'free', order: 'desc' }, { column: 'sku' }],
    mapRow: (r) => ({ ...r, name: friendlySkuName(r.sku), pctUsed: r.pctUsed == null ? null : Number(r.pctUsed) }),
  },
  {
    key: 'm365-mailboxes-near-quota',
    title: 'Buzones cerca de la cuota',
    description: 'Buzones de Microsoft 365 cuyo uso alcanza el porcentaje indicado de su cuota (cuando se llena deja de recibir correo). La fecha filtra por la última actividad.',
    source: 'Microsoft 365 (informe de uso)',
    dateLabel: 'Última actividad',
    dateExpression: 'm.last_activity_date',
    params: [{ name: 'minPct', label: 'Uso mínimo de la cuota (%)', type: 'number', default: 90, min: 1, max: 100 }],
    searchColumns: ['m.display_name', 'm.user_principal_name'],
    columns: [
      { key: 'displayName', label: 'Nombre', type: 'text' },
      { key: 'userPrincipalName', label: 'Correo', type: 'text' },
      { key: 'usedBytes', label: 'Usado', type: 'bytes' },
      { key: 'quotaBytes', label: 'Cuota', type: 'bytes' },
      { key: 'pctUsed', label: '% usado', type: 'percent' },
      { key: 'itemCount', label: 'Elementos', type: 'number' },
      { key: 'hasArchive', label: 'Archivo en línea', type: 'bool' },
      { key: 'lastActivityDate', label: 'Última actividad', type: 'date' },
    ],
    build: ({ minPct }) =>
      db('m365_mailbox_usage as m')
        .where('m.quota_bytes', '>', 0)
        .whereRaw('m.storage_used_bytes * 100.0 / m.quota_bytes >= ?', [minPct])
        .select(
          'm.display_name as displayName',
          'm.user_principal_name as userPrincipalName',
          'm.storage_used_bytes as usedBytes',
          'm.quota_bytes as quotaBytes',
          db.raw('round(m.storage_used_bytes * 100.0 / m.quota_bytes, 1) as "pctUsed"'),
          'm.item_count as itemCount',
          'm.has_archive as hasArchive',
          day('m.last_activity_date', 'lastActivityDate')
        ),
    orderBy: [{ column: 'pctUsed', order: 'desc' }, { column: 'userPrincipalName' }],
    mapRow: (r) => ({ ...r, pctUsed: Number(r.pctUsed), usedBytes: Number(r.usedBytes), quotaBytes: Number(r.quotaBytes), itemCount: r.itemCount == null ? null : Number(r.itemCount) }),
  },
  {
    key: 'm365-onedrive-inactive',
    title: 'OneDrive sin actividad',
    description: 'Cuentas de OneDrive sin actividad hace más de N días (respecto de la fecha del informe): espacio que se podría recuperar o revisar. La fecha filtra por la última actividad.',
    source: 'Microsoft 365 (informe de uso)',
    dateLabel: 'Última actividad',
    dateExpression: 'o.last_activity_date',
    params: [{ name: 'inactiveDays', label: 'Sin actividad hace más de (días)', type: 'number', default: 90, min: 1, max: 3650 }],
    searchColumns: ['o.display_name', 'o.user_principal_name'],
    columns: [
      { key: 'displayName', label: 'Usuario', type: 'text' },
      { key: 'userPrincipalName', label: 'Correo', type: 'text' },
      { key: 'usedBytes', label: 'Usado', type: 'bytes' },
      { key: 'allocatedBytes', label: 'Asignado', type: 'bytes' },
      { key: 'pctUsed', label: '% usado', type: 'percent' },
      { key: 'fileCount', label: 'Archivos', type: 'number' },
      { key: 'lastActivityDate', label: 'Última actividad', type: 'date' },
    ],
    build: ({ inactiveDays }) =>
      db('m365_onedrive_usage as o')
        .whereRaw('(o.last_activity_date is null or o.last_activity_date < o.report_date - ?::int)', [inactiveDays])
        .select(
          'o.display_name as displayName',
          'o.user_principal_name as userPrincipalName',
          'o.storage_used_bytes as usedBytes',
          'o.storage_allocated_bytes as allocatedBytes',
          db.raw('case when o.storage_allocated_bytes > 0 then round(o.storage_used_bytes * 100.0 / o.storage_allocated_bytes, 1) end as "pctUsed"'),
          'o.file_count as fileCount',
          day('o.last_activity_date', 'lastActivityDate')
        ),
    orderBy: [{ column: 'usedBytes', order: 'desc' }, { column: 'userPrincipalName' }],
    mapRow: (r) => ({ ...r, usedBytes: Number(r.usedBytes), allocatedBytes: r.allocatedBytes == null ? null : Number(r.allocatedBytes), pctUsed: r.pctUsed == null ? null : Number(r.pctUsed), fileCount: r.fileCount == null ? null : Number(r.fileCount) }),
  },
  {
    key: 'm365-sharepoint-inactive',
    title: 'Sitios de SharePoint sin actividad',
    description: 'Sitios de SharePoint sin actividad hace más de N días (respecto de la fecha del informe). La fecha filtra por la última actividad.',
    source: 'Microsoft 365 (informe de uso)',
    dateLabel: 'Última actividad',
    dateExpression: 's.last_activity_date',
    params: [{ name: 'inactiveDays', label: 'Sin actividad hace más de (días)', type: 'number', default: 180, min: 1, max: 3650 }],
    searchColumns: ['s.owner_display_name', 's.owner_principal_name', 's.site_url'],
    columns: [
      { key: 'name', label: 'Sitio (propietario)', type: 'text' },
      { key: 'template', label: 'Tipo', type: 'text' },
      { key: 'ownerPrincipalName', label: 'Correo del propietario', type: 'text' },
      { key: 'usedBytes', label: 'Usado', type: 'bytes' },
      { key: 'allocatedBytes', label: 'Asignado', type: 'bytes' },
      { key: 'fileCount', label: 'Archivos', type: 'number' },
      { key: 'lastActivityDate', label: 'Última actividad', type: 'date' },
    ],
    build: ({ inactiveDays }) =>
      db('m365_sharepoint_sites as s')
        .whereRaw('(s.last_activity_date is null or s.last_activity_date < s.report_date - ?::int)', [inactiveDays])
        .select(
          's.owner_display_name as name',
          's.root_web_template as template',
          's.owner_principal_name as ownerPrincipalName',
          's.storage_used_bytes as usedBytes',
          's.storage_allocated_bytes as allocatedBytes',
          's.file_count as fileCount',
          day('s.last_activity_date', 'lastActivityDate')
        ),
    orderBy: [{ column: 'usedBytes', order: 'desc' }, { column: 'name' }],
    mapRow: (r) => ({ ...r, usedBytes: Number(r.usedBytes), allocatedBytes: r.allocatedBytes == null ? null : Number(r.allocatedBytes), fileCount: r.fileCount == null ? null : Number(r.fileCount) }),
  },
  {
    key: 'netbackup-successful-runs',
    title: 'Backups de networking exitosos',
    description:
      'Ejecuciones exitosas del backup de configuración de equipos de networking (una fila por ejecución). La fecha filtra por el inicio de la ejecución (día en UTC); la hora también se muestra en UTC.',
    source: 'Backup Networking',
    dateLabel: 'Inicio de la ejecución',
    dateExpression: 'r.started_at::date',
    params: [],
    searchColumns: ['h.brand', 'h.model', 'h.management_ip', 'o.name'],
    columns: [
      { key: 'device', label: 'Equipo', type: 'text' },
      { key: 'managementIp', label: 'IP de gestión', type: 'text' },
      { key: 'office', label: 'Oficina', type: 'text' },
      { key: 'startedAt', label: 'Inicio (UTC)', type: 'text' },
      { key: 'durationSeconds', label: 'Duración (s)', type: 'number' },
      { key: 'trigger', label: 'Disparo', type: 'text' },
    ],
    build: () =>
      db('netbackup_runs as r')
        .join('netbackup_devices as d', 'd.id', 'r.device_id')
        .join('hardware_inventory as h', 'h.id', 'd.hardware_id')
        .join('offices as o', 'o.id', 'h.office_id')
        .where('r.result', 'success')
        .select(
          db.raw(`h.brand || ' ' || h.model as "device"`),
          'h.management_ip as managementIp',
          'o.name as office',
          db.raw(`to_char(r.started_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as "startedAt"`),
          db.raw('round(extract(epoch from (r.finished_at - r.started_at)))::int as "durationSeconds"'),
          db.raw(`case r.trigger when 'manual' then 'Manual' else 'Programado' end as "trigger"`)
        ),
    orderBy: [{ column: 'startedAt', order: 'desc' }, { column: 'device' }],
  },
  {
    key: 'veeam-successful-jobs',
    title: 'Jobs de Veeam con última ejecución exitosa',
    description:
      'Jobs de Veeam Backup & Replication cuya ÚLTIMA ejecución terminó con éxito. Veeam solo informa la última ejecución de cada job (no el historial), por lo que la fecha filtra por esa última ejecución y depende de la frecuencia de sincronización.',
    source: 'Veeam',
    dateLabel: 'Última ejecución',
    dateExpression: 'j.last_run_at::date',
    params: [],
    searchColumns: ['j.name'],
    columns: [
      { key: 'name', label: 'Job', type: 'text' },
      { key: 'lastRunAt', label: 'Última ejecución (UTC)', type: 'text' },
      { key: 'syncedAt', label: 'Sincronizado (UTC)', type: 'text' },
    ],
    build: () =>
      db('backup_jobs as j')
        .where('j.last_status', 'Success')
        .select(
          'j.name',
          db.raw(`to_char(j.last_run_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as "lastRunAt"`),
          db.raw(`to_char(j.synced_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as "syncedAt"`)
        ),
    orderBy: [{ column: 'lastRunAt', order: 'desc' }, { column: 'name' }],
  },
  {
    key: 'ad-users',
    title: 'Usuarios de Active Directory',
    description: 'Listado completo de usuarios sincronizados desde Active Directory: nombre, correo, usuario, fecha de creación y estado.',
    source: 'Active Directory',
    dateLabel: null,
    params: [],
    columns: [
      { key: 'displayName', label: 'Nombre', type: 'text' },
      { key: 'mail', label: 'Correo', type: 'text' },
      { key: 'username', label: 'Usuario', type: 'text' },
      { key: 'createdAt', label: 'Fecha de creación', type: 'date' },
      { key: 'status', label: 'Estado', type: 'text' },
    ],
    build: () =>
      db('ad_users as u').select(
        'u.display_name as displayName',
        'u.mail as mail',
        'u.sam_account_name as username',
        day('u.ad_created_at', 'createdAt'),
        db.raw(`case when u.enabled then 'Activo' else 'Inactivo' end as "status"`)
      ),
    orderBy: [{ column: 'displayName' }, { column: 'username' }],
  },
  {
    key: 'uem-pending-patches',
    title: 'Equipos con parches pendientes',
    description: 'Equipos de UEM (Endpoint Central) con parches pendientes de instalar, de mayor a menor.',
    source: 'UEM (Endpoint Central)',
    dateLabel: null,
    params: [{ name: 'minPending', label: 'Mínimo de parches pendientes', type: 'number', default: 1, min: 0, max: 100000 }],
    searchColumns: ['v.computer_name', 'v.os_name'],
    columns: [
      { key: 'computerName', label: 'Equipo', type: 'text' },
      { key: 'osName', label: 'Sistema operativo', type: 'text' },
      { key: 'pendingPatchesCount', label: 'Parches pendientes', type: 'number' },
      { key: 'syncedAt', label: 'Última sincronización', type: 'date' },
    ],
    build: ({ minPending }) =>
      db('vuln_computers as v')
        .where('v.pending_patches_count', '>=', minPending)
        .select('v.computer_name as computerName', 'v.os_name as osName', 'v.pending_patches_count as pendingPatchesCount', day('v.synced_at', 'syncedAt')),
    orderBy: [{ column: 'pendingPatchesCount', order: 'desc' }, { column: 'computerName' }],
  },
  {
    key: 'uem-critical-patches',
    title: 'Equipos con parches críticos pendientes',
    description: 'Equipos de UEM (Endpoint Central) con parches críticos o importantes pendientes — para priorizar sobre el resto.',
    source: 'UEM (Endpoint Central)',
    dateLabel: null,
    params: [{ name: 'minCritical', label: 'Mínimo de parches críticos', type: 'number', default: 1, min: 0, max: 100000 }],
    searchColumns: ['v.computer_name', 'v.os_name'],
    columns: [
      { key: 'computerName', label: 'Equipo', type: 'text' },
      { key: 'osName', label: 'Sistema operativo', type: 'text' },
      { key: 'criticalPatchCount', label: 'Parches críticos', type: 'number' },
      { key: 'importantPatchCount', label: 'Parches importantes', type: 'number' },
      { key: 'pendingPatchesCount', label: 'Total pendientes', type: 'number' },
    ],
    build: ({ minCritical }) =>
      db('vuln_computers as v')
        .where('v.critical_patch_count', '>=', minCritical)
        .select(
          'v.computer_name as computerName',
          'v.os_name as osName',
          'v.critical_patch_count as criticalPatchCount',
          'v.important_patch_count as importantPatchCount',
          'v.pending_patches_count as pendingPatchesCount'
        ),
    orderBy: [{ column: 'criticalPatchCount', order: 'desc' }, { column: 'importantPatchCount', order: 'desc' }, { column: 'computerName' }],
  },
  {
    key: 'uem-stale-scans',
    title: 'Equipos sin escanear',
    description:
      'Equipos de UEM (Endpoint Central) sin un escaneo de parches exitoso hace más de N días, o que nunca se escanearon — señal de que el agente no está funcionando.',
    source: 'UEM (Endpoint Central)',
    dateLabel: 'Último escaneo exitoso',
    dateExpression: 'v.last_successful_scan::date',
    params: [{ name: 'staleDays', label: 'Sin escanear hace más de (días)', type: 'number', default: 30, min: 1, max: 3650 }],
    searchColumns: ['v.computer_name', 'v.os_name'],
    columns: [
      { key: 'computerName', label: 'Equipo', type: 'text' },
      { key: 'osName', label: 'Sistema operativo', type: 'text' },
      { key: 'pendingPatchesCount', label: 'Parches pendientes', type: 'number' },
      { key: 'lastSuccessfulScan', label: 'Último escaneo exitoso', type: 'date' },
    ],
    build: ({ staleDays }) =>
      db('vuln_computers as v')
        .whereRaw('(v.last_successful_scan is null or v.last_successful_scan < now() - make_interval(days => ?::int))', [staleDays])
        .select(
          'v.computer_name as computerName',
          'v.os_name as osName',
          'v.pending_patches_count as pendingPatchesCount',
          day('v.last_successful_scan', 'lastSuccessfulScan'),
          db.raw(`coalesce(v.last_successful_scan, '-infinity'::timestamptz) as "scanSortKey"`)
        ),
    orderBy: [{ column: 'scanSortKey' }, { column: 'computerName' }],
  },
  {
    key: 'uem-agent-offline',
    title: 'Equipos con el agente sin contacto',
    description:
      'Equipos de UEM (Endpoint Central) cuyo agente no contactó al servidor hace más de N días, o nunca contactó — agente caído, equipo apagado o desconectado de la red.',
    source: 'UEM (Endpoint Central)',
    dateLabel: 'Último contacto del agente',
    dateExpression: 'v.agent_last_contact_time::date',
    params: [{ name: 'staleDays', label: 'Sin contacto hace más de (días)', type: 'number', default: 14, min: 1, max: 3650 }],
    searchColumns: ['v.computer_name', 'v.os_name'],
    columns: [
      { key: 'computerName', label: 'Equipo', type: 'text' },
      { key: 'osName', label: 'Sistema operativo', type: 'text' },
      { key: 'pendingPatchesCount', label: 'Parches pendientes', type: 'number' },
      { key: 'agentLastContactTime', label: 'Último contacto del agente', type: 'date' },
    ],
    build: ({ staleDays }) =>
      db('vuln_computers as v')
        .whereRaw('(v.agent_last_contact_time is null or v.agent_last_contact_time < now() - make_interval(days => ?::int))', [staleDays])
        .select(
          'v.computer_name as computerName',
          'v.os_name as osName',
          'v.pending_patches_count as pendingPatchesCount',
          day('v.agent_last_contact_time', 'agentLastContactTime'),
          db.raw(`coalesce(v.agent_last_contact_time, '-infinity'::timestamptz) as "contactSortKey"`)
        ),
    orderBy: [{ column: 'contactSortKey' }, { column: 'computerName' }],
  },
  {
    key: 'uem-agent-coverage',
    title: 'Cobertura del agente por sistema operativo',
    description:
      'Equipos en el dominio (Active Directory) vs. equipos con el agente de Endpoint Central instalado, agrupados por sistema operativo — mismo cruce del gráfico del dashboard UEM, en tabla exportable.',
    source: 'Active Directory + UEM (Endpoint Central)',
    dateLabel: null,
    params: [],
    columns: [
      { key: 'family', label: 'Sistema operativo', type: 'text' },
      { key: 'domainCount', label: 'En el dominio (AD)', type: 'number' },
      { key: 'agentCount', label: 'Con agente (UEM)', type: 'number' },
    ],
    build: () => vulnRepository.agentCoverageQuery(),
    orderBy: [{ column: 'sortRank' }, { column: 'sortTotal', order: 'desc' }, { column: 'family' }],
  },
];

export function findReport(key) {
  return REPORTS.find((r) => r.key === key);
}

/** Lo que el frontend necesita para dibujar el reporte (sin la consulta). */
export function describeReport(report) {
  const { key, title, description, source, dateLabel, params, columns, searchColumns } = report;
  return { key, title, description, source, dateLabel, params, columns, searchable: Boolean(searchColumns?.length) };
}
