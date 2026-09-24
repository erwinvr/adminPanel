/**
 * audit/auditModules.js
 *
 * Cómo se reparten los eventos de audit_logs entre las páginas de
 * Auditoría (una por módulo).
 */

// Cada integración registra sus eventos con un prefijo de acción propio
// ("ad.sync", "m365.sync", "backup.sync" = Veeam, ...). La página de
// Auditoría se divide por módulo con ese prefijo; 'application' es todo
// lo demás (usuarios, roles, sesiones, ABM, etc.).
export const INTEGRATION_PREFIXES = {
  m365: 'm365',
  ad: 'ad',
  veeam: 'backup',
  vuln: 'vuln',
  pam360: 'pam360',
};

export const AUDIT_MODULES = { application: null, ...INTEGRATION_PREFIXES };

// Backup Networking tiene sus propias vistas (Historial, Bitácora,
// Compliance) y no se lista en ninguna página de Auditoría.
export const EXCLUDED_EVERYWHERE = ['netbackup'];
