/**
 * permissions/catalog.js
 *
 * Fuente única de verdad de los códigos de permiso que existen en el
 * sistema. Tanto el seed de base de datos como el middleware
 * `requirePermission` y el frontend (a través de GET /api/permissions)
 * derivan de esta lista — así nunca hay un permiso "fantasma" usado en
 * código que no exista en la base, o viceversa.
 */

export const PERMISSIONS = Object.freeze({
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete', // en la práctica: desactivar (soft delete)

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

  M365_VIEW: 'm365.view',
  M365_EDIT: 'm365.edit',
});

/**
 * Metadatos usados únicamente por el seed para poblar la tabla
 * `permissions` con descripciones legibles.
 */
export const PERMISSION_DEFINITIONS = [
  { code: PERMISSIONS.USERS_VIEW, module: 'users', description: 'Ver listado y detalle de usuarios' },
  { code: PERMISSIONS.USERS_CREATE, module: 'users', description: 'Crear usuarios' },
  { code: PERMISSIONS.USERS_UPDATE, module: 'users', description: 'Modificar usuarios existentes' },
  { code: PERMISSIONS.USERS_DELETE, module: 'users', description: 'Desactivar usuarios' },

  { code: PERMISSIONS.ROLES_VIEW, module: 'roles', description: 'Ver listado y detalle de roles' },
  { code: PERMISSIONS.ROLES_CREATE, module: 'roles', description: 'Crear roles' },
  { code: PERMISSIONS.ROLES_UPDATE, module: 'roles', description: 'Modificar roles y sus permisos' },
  { code: PERMISSIONS.ROLES_DELETE, module: 'roles', description: 'Eliminar roles (no del sistema)' },

  { code: PERMISSIONS.PERMISSIONS_VIEW, module: 'permissions', description: 'Ver el catálogo de permisos' },

  { code: PERMISSIONS.AUDIT_VIEW, module: 'audit', description: 'Consultar el registro de auditoría' },

  { code: PERMISSIONS.TOPOLOGY_VIEW, module: 'topology', description: 'Ver el mapa de topología de aplicaciones' },
  { code: PERMISSIONS.TOPOLOGY_EDIT, module: 'topology', description: 'Editar nodos y conexiones del mapa de topología' },

  { code: PERMISSIONS.PROVIDERS_VIEW, module: 'providers', description: 'Ver proveedores y sus aplicaciones vinculadas' },
  { code: PERMISSIONS.PROVIDERS_EDIT, module: 'providers', description: 'Crear, editar y eliminar proveedores; vincular aplicaciones' },

  { code: PERMISSIONS.LICENSES_VIEW, module: 'licenses', description: 'Ver el listado de licencias' },
  { code: PERMISSIONS.LICENSES_EDIT, module: 'licenses', description: 'Crear, editar y eliminar licencias' },

  { code: PERMISSIONS.M365_VIEW, module: 'm365', description: 'Ver licencias y usuarios sincronizados desde Microsoft 365' },
  { code: PERMISSIONS.M365_EDIT, module: 'm365', description: 'Configurar la conexión a Microsoft 365 y disparar la sincronización' },
];
