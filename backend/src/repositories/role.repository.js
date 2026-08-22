import { db } from '../config/database.js';

export const roleRepository = {
  list() {
    return db('roles').select('id', 'name', 'description', 'is_system', 'created_at').orderBy('name');
  },

  findById(id) {
    return db('roles').where({ id }).first();
  },

  findByName(name) {
    return db('roles').where({ name }).first();
  },

  create({ name, description }, trx = db) {
    return trx('roles')
      .insert({ name, description, is_system: false })
      .returning(['id', 'name', 'description', 'is_system', 'created_at'])
      .then(([row]) => row);
  },

  update(id, changes, trx = db) {
    return trx('roles')
      .where({ id })
      .update({ ...changes, updated_at: trx.fn.now() })
      .returning(['id', 'name', 'description', 'is_system', 'created_at'])
      .then(([row]) => row);
  },

  delete(id, trx = db) {
    return trx('roles').where({ id }).del();
  },

  async listPermissions(roleId) {
    const rows = await db('role_permissions as rp')
      .join('permissions as p', 'p.id', 'rp.permission_id')
      .where('rp.role_id', roleId)
      .select('p.id', 'p.code', 'p.module', 'p.description');
    return rows;
  },

  async setPermissions(roleId, permissionIds, trx = db) {
    await trx('role_permissions').where({ role_id: roleId }).del();
    if (permissionIds.length > 0) {
      await trx('role_permissions').insert(
        permissionIds.map((permission_id) => ({ role_id: roleId, permission_id }))
      );
    }
  },

  async listUserRoleIds(userId) {
    const rows = await db('user_roles').where({ user_id: userId }).select('role_id');
    return rows.map((r) => r.role_id);
  },

  async setUserRoles(userId, roleIds, assignedBy, trx = db) {
    await trx('user_roles').where({ user_id: userId }).del();
    if (roleIds.length > 0) {
      await trx('user_roles').insert(
        roleIds.map((role_id) => ({ user_id: userId, role_id, assigned_by: assignedBy }))
      );
    }
  },

  countUsersWithRole(roleId) {
    return db('user_roles').where({ role_id: roleId }).count({ count: '*' }).first().then((r) => Number(r.count));
  },
};
