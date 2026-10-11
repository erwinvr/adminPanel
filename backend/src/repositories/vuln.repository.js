import { db } from '../config/database.js';
import { createSettingsRepository } from './settings.js';
import { replaceTableContents } from './bulk.js';

/**
 * Agrupa un nombre de sistema operativo (de Active Directory o de Endpoint
 * Central, que lo describen con distinto nivel de detalle) en una familia
 * corta y comparable — ej. "Windows Server 2022 Standard Edition (x64)" (EC)
 * y "Windows Server 2022 Standard" (AD) caen las dos en "Windows Server
 * 2022". Que la familia diga "Server" o no es justamente lo que permite
 * distinguir servidores de equipos de usuario. Expresión SQL (no JS) para
 * poder reutilizarla tal cual en el reporte de cobertura (reportCatalog.js
 * necesita un knex query builder, no un array ya procesado) — una sola
 * definición para que el dashboard y el reporte siempre coincidan.
 */
export function osFamilySql(column) {
  return `
    case
      when ${column} is null or btrim(${column}) = '' then 'Sin dato'
      when ${column} ~* 'windows\\s*server' then
        'Windows Server' || coalesce(' ' || (regexp_match(${column}, 'windows\\s*server\\s*([0-9]{4})', 'i'))[1], '')
      when ${column} ~* 'windows\\s*[0-9]{1,2}' then
        'Windows ' || (regexp_match(${column}, 'windows\\s*([0-9]{1,2})', 'i'))[1]
      when ${column} ~* '(ubuntu|debian|centos|red\\s*hat|rhel|linux)' then 'Linux'
      when ${column} ~* '(mac\\s*os|os x)' then 'macOS'
      else btrim(${column})
    end
  `;
}

/**
 * El query (sin ejecutar) que cruza ad_computers y vuln_computers por
 * familia de SO. Incluye "sortRank"/"sortTotal" (servidores primero, luego
 * equipos de usuario, "Sin dato" al final; dentro de cada grupo, de mayor a
 * menor total) para que el reporte homónimo (reportCatalog.js) pueda
 * ordenar en SQL con `orderBy` — no son columnas del reporte, el motor de
 * reportes solo expone las declaradas en `report.columns`.
 */
function agentCoverageQuery() {
  return db
    .with('domain', (qb) => qb.from('ad_computers').select(db.raw(`${osFamilySql('operating_system')} as family`), db.raw('count(*) as domain_count')).groupByRaw('1'))
    .with('agent', (qb) => qb.from('vuln_computers').select(db.raw(`${osFamilySql('os_name')} as family`), db.raw('count(*) as agent_count')).groupByRaw('1'))
    .select(
      db.raw('coalesce(d.family, a.family) as "family"'),
      db.raw('coalesce(d.domain_count, 0)::int as "domainCount"'),
      db.raw('coalesce(a.agent_count, 0)::int as "agentCount"'),
      db.raw(`case when coalesce(d.family, a.family) = 'Sin dato' then 2 when coalesce(d.family, a.family) ~* 'server' then 0 else 1 end as "sortRank"`),
      db.raw('coalesce(d.domain_count, 0) + coalesce(a.agent_count, 0) as "sortTotal"')
    )
    .from('domain as d')
    .fullOuterJoin('agent as a', 'd.family', 'a.family');
}

export const vulnRepository = {
  ...createSettingsRepository('vuln_settings'),

  replaceSyncedComputers(computers) {
    return replaceTableContents(db, 'vuln_computers', computers);
  },

  listComputers() {
    return db('vuln_computers')
      .select('id', 'resource_id as resourceId', 'computer_name as computerName', 'pending_patches_count as pendingPatchesCount', 'synced_at as syncedAt')
      .orderBy('computer_name');
  },

  topComputersByPendingPatches(limit = 10) {
    return db('vuln_computers')
      .select('id', 'computer_name as computerName', 'pending_patches_count as pendingPatchesCount')
      .where('pending_patches_count', '>', 0)
      .orderBy('pending_patches_count', 'desc')
      .limit(limit);
  },

  countComputers() {
    return db('vuln_computers')
      .count({ count: '*' })
      .first()
      .then((r) => Number(r.count));
  },

  countComputersWithPendingPatches() {
    return db('vuln_computers')
      .where('pending_patches_count', '>', 0)
      .count({ count: '*' })
      .first()
      .then((r) => Number(r.count));
  },

  /**
   * Equipos en el dominio (Active Directory) vs. equipos con el agente de
   * Endpoint Central, agrupados por sistema operativo — para el gráfico de
   * cobertura del dashboard UEM (mismo query que usa el reporte homónimo,
   * ver reportCatalog.js). Cruza `ad_computers` directamente (mismo
   * criterio que `insights.repository.js` con `ad_users`/`m365_users`).
   */
  async agentCoverageByOs() {
    const rows = await agentCoverageQuery();
    // Orden: servidores primero, luego equipos de usuario, "Sin dato" al final; dentro de cada grupo, de mayor a menor total.
    const rank = (family) => (family === 'Sin dato' ? 2 : /server/i.test(family) ? 0 : 1);
    return rows
      .map((r) => ({ ...r, isServer: /server/i.test(r.family) }))
      .sort((a, b) => rank(a.family) - rank(b.family) || b.domainCount + b.agentCount - (a.domainCount + a.agentCount) || a.family.localeCompare(b.family));
  },

  agentCoverageQuery,
};
