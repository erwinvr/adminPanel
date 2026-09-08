import { db } from '../config/database.js';

export const adRepository = {
  getSettings() {
    return db('ad_settings').first();
  },

  async upsertSettings(changes) {
    const existing = await db('ad_settings').first();
    if (existing) {
      const [row] = await db('ad_settings').where({ id: existing.id }).update(changes).returning('*');
      return row;
    }
    const [row] = await db('ad_settings').insert(changes).returning('*');
    return row;
  },

  // Reemplaza TODO el contenido de ad_users dentro de una transacción —
  // es una foto del último sync, no un espejo incremental (ver
  // comentario en la migración).
  async replaceSyncedUsers(users) {
    await db.transaction(async (trx) => {
      await trx('ad_users').del();
      if (users.length) await trx('ad_users').insert(users);
    });
  },

  listUsers() {
    return db('ad_users')
      .select(
        'id',
        'distinguished_name as distinguishedName',
        'sam_account_name as samAccountName',
        'display_name as displayName',
        'ad_created_at as createdAt',
        'last_login_at as lastLoginAt',
        'password_last_set_at as passwordLastSetAt',
        'enabled',
        'synced_at as syncedAt'
      )
      .orderBy('display_name');
  },

  listLockedUsers() {
    return db('ad_users')
      .select(
        'id',
        'distinguished_name as distinguishedName',
        'sam_account_name as samAccountName',
        'display_name as displayName',
        'lockout_time as lockoutTime'
      )
      .where('locked_out', true)
      .orderBy('lockout_time', 'desc');
  },

  findUserById(id) {
    return db('ad_users').where({ id }).first();
  },

  // Se llama apenas el LDAP MODIFY de desbloqueo tiene éxito — refleja
  // el cambio en la foto local al toque, sin esperar el próximo sync
  // automático (ver ad.service.js#unlockUser).
  markUnlocked(id) {
    return db('ad_users').where({ id }).update({ locked_out: false, lockout_time: null });
  },
};
