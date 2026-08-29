import { db } from '../config/database.js';

export const m365Repository = {
  getSettings() {
    return db('m365_settings').first();
  },

  async upsertSettings(changes) {
    const existing = await db('m365_settings').first();
    if (existing) {
      const [row] = await db('m365_settings').where({ id: existing.id }).update(changes).returning('*');
      return row;
    }
    const [row] = await db('m365_settings').insert(changes).returning('*');
    return row;
  },

  // Reemplaza TODO el contenido de las tablas de sincronización dentro de
  // una transacción — son una foto del último sync, no un espejo
  // incremental (ver comentario en la migración).
  async replaceSyncedData({ licenses, users, userLicensePairs }) {
    await db.transaction(async (trx) => {
      await trx('m365_user_licenses').del();
      await trx('m365_licenses').del();
      await trx('m365_users').del();

      const insertedLicenses = licenses.length ? await trx('m365_licenses').insert(licenses).returning(['id', 'sku_id']) : [];
      const insertedUsers = users.length ? await trx('m365_users').insert(users).returning(['id', 'aad_object_id']) : [];

      const licenseIdBySkuId = new Map(insertedLicenses.map((l) => [l.sku_id, l.id]));
      const userIdByAadId = new Map(insertedUsers.map((u) => [u.aad_object_id, u.id]));

      const pairsToInsert = userLicensePairs
        .map(({ aadObjectId, skuId }) => ({
          m365_user_id: userIdByAadId.get(aadObjectId),
          m365_license_id: licenseIdBySkuId.get(skuId),
        }))
        .filter((p) => p.m365_user_id && p.m365_license_id);

      if (pairsToInsert.length) {
        await trx('m365_user_licenses').insert(pairsToInsert);
      }
    });
  },

  listLicenses() {
    return db('m365_licenses')
      .select(
        'id',
        'sku_id as skuId',
        'sku_part_number as skuPartNumber',
        'enabled_units as enabledUnits',
        'consumed_units as consumedUnits',
        'synced_at as syncedAt'
      )
      .orderBy('sku_part_number');
  },

  async listUsersWithLicenses() {
    const users = await db('m365_users')
      .select(
        'id',
        'aad_object_id as aadObjectId',
        'display_name as displayName',
        'user_principal_name as userPrincipalName',
        'account_enabled as accountEnabled',
        'is_mfa_registered as isMfaRegistered',
        'is_mfa_capable as isMfaCapable',
        'methods_registered as methodsRegistered',
        'synced_at as syncedAt'
      )
      .orderBy('display_name');

    const links = await db('m365_user_licenses as ul')
      .join('m365_licenses as l', 'l.id', 'ul.m365_license_id')
      .select('ul.m365_user_id as userId', 'l.sku_part_number as skuPartNumber');

    return users.map((u) => ({
      ...u,
      licenses: links.filter((l) => l.userId === u.id).map((l) => l.skuPartNumber),
    }));
  },
};
