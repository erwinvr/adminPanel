/**
 * permissions/catalog.js (frontend)
 *
 * Copia intencional de los códigos de permiso definidos en
 * backend/src/permissions/catalog.js. No se puede importar directamente
 * el archivo del backend desde el navegador (son dos runtimes/paquetes
 * separados), así que esta lista se mantiene en paralelo. Si se agrega
 * un permiso nuevo en el backend, agregarlo aquí también.
 */

export const PERMISSIONS = Object.freeze({
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',

  ROLES_VIEW: 'roles.view',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',

  PERMISSIONS_VIEW: 'permissions.view',

  AUDIT_VIEW: 'audit.view',

  TOPOLOGY_VIEW: 'topology.view',
  TOPOLOGY_EDIT: 'topology.edit',

  PROVIDERS_VIEW: 'providers.view',
  PROVIDERS_EDIT: 'providers.edit',

  LICENSES_VIEW: 'licenses.view',
  LICENSES_EDIT: 'licenses.edit',

  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_EDIT: 'inventory.edit',

  OFFICES_VIEW: 'offices.view',
  OFFICES_EDIT: 'offices.edit',

  VAULT_VIEW: 'vault.view',
  VAULT_EDIT: 'vault.edit',

  AD_VIEW: 'ad.view',
  AD_EDIT: 'ad.edit',

  INSIGHTS_VIEW: 'insights.view',

  BACKUPS_VIEW: 'backups.view',
  BACKUPS_EDIT: 'backups.edit',

  VULN_VIEW: 'vuln.view',
  VULN_EDIT: 'vuln.edit',

  NETBACKUP_VIEW: 'netbackup.view',
  NETBACKUP_EDIT: 'netbackup.edit',

  SMTP_EDIT: 'smtp.edit',

  M365_VIEW: 'm365.view',
  M365_EDIT: 'm365.edit',
});
