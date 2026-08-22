import { db } from '../config/database.js';

export const permissionRepository = {
  listAll() {
    return db('permissions').select('id', 'code', 'module', 'description').orderBy(['module', 'code']);
  },

  findByCodes(codes) {
    return db('permissions').select('id', 'code').whereIn('code', codes);
  },

  /**
   * Códigos de permiso efectivos de un usuario = unión de los permisos de
   * todos sus roles asignados. Una sola consulta con JOIN, no N+1.
   * @param {string} userId
   * @returns {Promise<string[]>}
   */
  async findEffectiveCodesForUser(userId) {
    const rows = await db('user_roles as ur')
      .join('role_permissions as rp', 'rp.role_id', 'ur.role_id')
      .join('permissions as p', 'p.id', 'rp.permission_id')
      .where('ur.user_id', userId)
      .distinct('p.code');
    return rows.map((r) => r.code);
  },

  /**
   * Igual que arriba pero a partir de una lista de role_ids ya conocida
   * (evita una consulta extra cuando el caller ya tiene los roles del
   * usuario en sesión).
   * @param {string[]} roleIds
   * @returns {Promise<string[]>}
   */
  async findEffectiveCodesForRoles(roleIds) {
    if (roleIds.length === 0) return [];
    const rows = await db('role_permissions as rp')
      .join('permissions as p', 'p.id', 'rp.permission_id')
      .whereIn('rp.role_id', roleIds)
      .distinct('p.code');
    return rows.map((r) => r.code);
  },
};
