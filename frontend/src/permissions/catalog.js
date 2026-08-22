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
});
