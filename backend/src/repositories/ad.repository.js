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
        'password_never_expires as passwordNeverExpires',
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

  listAdministrators() {
    return db('ad_users')
      .select(
        'id',
        'distinguished_name as distinguishedName',
        'sam_account_name as samAccountName',
        'display_name as displayName',
        'enabled',
        'privileged_groups as privilegedGroups'
      )
      .whereRaw('array_length(privileged_groups, 1) > 0')
      .orderBy('display_name');
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

  // Mismo criterio que replaceSyncedUsers — foto completa reemplazada
  // en cada sync, no un espejo incremental.
  async replaceSyncedComputers(computers) {
    await db.transaction(async (trx) => {
      await trx('ad_computers').del();
      if (computers.length) await trx('ad_computers').insert(computers);
    });
  },

  listComputers() {
    return db('ad_computers')
      .select(
        'id',
        'distinguished_name as distinguishedName',
        'name',
        'dns_host_name as dnsHostName',
        'operating_system as operatingSystem',
        'operating_system_version as operatingSystemVersion',
        'ad_created_at as createdAt',
        'last_login_at as lastLoginAt',
        'enabled',
        'synced_at as syncedAt'
      )
      .orderBy('name');
  },
};
