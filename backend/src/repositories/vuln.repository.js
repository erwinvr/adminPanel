import { db } from '../config/database.js';
import { createSettingsRepository } from './settings.js';
import { replaceTableContents } from './bulk.js';

// Agrupa un nombre de sistema operativo (de Active Directory o de Endpoint
// Central, que lo describen con distinto nivel de detalle) en una familia
// corta y comparable — ej. "Windows Server 2022 Standard Edition (x64)" (EC)
// y "Windows Server 2022 Standard" (AD) caen las dos en "Windows Server
// 2022". Que la familia diga "Server" o no es justamente lo que permite
// distinguir servidores de equipos de usuario en el gráfico de cobertura.
function osFamily(raw) {
  if (!raw) return 'Sin dato';
  const s = String(raw).trim();
  let m = s.match(/windows\s*server\s*(\d{4})?/i);
  if (m) return m[1] ? `Windows Server ${m[1]}` : 'Windows Server';
  m = s.match(/windows\s*(\d{1,2})\b/i);
  if (m) return `Windows ${m[1]}`;
  if (/ubuntu|debian|centos|red\s*hat|rhel|\blinux\b/i.test(s)) return 'Linux';
  if (/mac\s*os|os x/i.test(s)) return 'macOS';
  return s || 'Sin dato';
}

function countByFamily(values) {
  const counts = new Map();
  for (const value of values) {
    const family = osFamily(value);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return counts;
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
   * cobertura del dashboard UEM. Cruza `ad_computers` directamente (mismo
   * criterio que `insights.repository.js` con `ad_users`/`m365_users`).
   */
  async agentCoverageByOs() {
    const [domainOs, agentOs] = await Promise.all([db('ad_computers').pluck('operating_system'), db('vuln_computers').pluck('os_name')]);
    const domainCounts = countByFamily(domainOs);
    const agentCounts = countByFamily(agentOs);
    const families = new Set([...domainCounts.keys(), ...agentCounts.keys()]);

    // Orden: servidores primero, luego equipos de usuario, "Sin dato" al final; dentro de cada grupo, de mayor a menor total.
    const rank = (family, isServer) => (family === 'Sin dato' ? 2 : isServer ? 0 : 1);
    const rows = [...families].map((family) => ({
      family,
      isServer: /server/i.test(family),
      domainCount: domainCounts.get(family) ?? 0,
      agentCount: agentCounts.get(family) ?? 0,
    }));
    rows.sort((a, b) => rank(a.family, a.isServer) - rank(b.family, b.isServer) || b.domainCount + b.agentCount - (a.domainCount + a.agentCount) || a.family.localeCompare(b.family));
    return rows;
  },
};
