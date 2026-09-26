import { db } from '../config/database.js';
import { createSettingsRepository } from './settings.js';
import { chunkedInsert } from './bulk.js';

export const m365Repository = {
  ...createSettingsRepository('m365_settings'),

  // Reemplaza TODO el contenido de las tablas de sincronización dentro de
  // una transacción — son una foto del último sync, no un espejo
  // incremental (ver comentario en la migración).
  async replaceSyncedData({ licenses, users, userLicensePairs }) {
    await db.transaction(async (trx) => {
      await trx('m365_user_licenses').del();
      await trx('m365_licenses').del();
      await trx('m365_users').del();

      const insertedLicenses = await chunkedInsert(trx, 'm365_licenses', licenses, { returning: ['id', 'sku_id'] });
      const insertedUsers = await chunkedInsert(trx, 'm365_users', users, { returning: ['id', 'aad_object_id'] });

      const licenseIdBySkuId = new Map(insertedLicenses.map((l) => [l.sku_id, l.id]));
      const userIdByAadId = new Map(insertedUsers.map((u) => [u.aad_object_id, u.id]));

      const pairsToInsert = userLicensePairs
        .map(({ aadObjectId, skuId }) => ({
          m365_user_id: userIdByAadId.get(aadObjectId),
          m365_license_id: licenseIdBySkuId.get(skuId),
        }))
        .filter((p) => p.m365_user_id && p.m365_license_id);

      await chunkedInsert(trx, 'm365_user_licenses', pairsToInsert);
    });
  },

  /** Último MFA leído de cada usuario, para conservarlo en la próxima foto (el sync reemplaza la tabla). */
  async getMfaSnapshot() {
    const rows = await db('m365_users').select('aad_object_id', 'is_mfa_registered', 'methods_registered', 'mfa_checked_at');
    return new Map(
      rows.map((r) => [
        r.aad_object_id,
        { isMfaRegistered: r.is_mfa_registered, methodsRegistered: r.methods_registered, checkedAt: r.mfa_checked_at },
      ])
    );
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

  /**
   * Una PÁGINA de usuarios con sus licencias (códigos SKU). La búsqueda es
   * por términos: cada término debe aparecer (sin tildes ni mayúsculas) en
   * el nombre, el email o alguna licencia del usuario — `termFilters` trae,
   * por término, los SKU cuyo nombre lo contiene (los resuelve el servicio,
   * que conoce los nombres comerciales).
   *
   * `mfa`: 'registered' (tiene método de segundo factor), 'missing' (no tiene),
   * 'unknown' (sin dato: cuenta deshabilitada o aún no leído).
   *
   * @param {{ page: number, pageSize: number, termFilters?: { term: string, skus: string[] }[], mfa?: 'registered' | 'missing' | 'unknown' }} params
   */
  async listUsersPage({ page, pageSize, termFilters = [], mfa }) {
    const query = db('m365_users as u');

    if (mfa === 'registered') query.where('u.is_mfa_registered', true);
    else if (mfa === 'missing') query.where('u.is_mfa_registered', false);
    else if (mfa === 'unknown') query.whereNull('u.is_mfa_registered');

    for (const { term, skus } of termFilters) {
      const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
      query.andWhere((qb) => {
        qb.whereRaw('unaccent(lower(u.display_name)) like ?', [pattern]).orWhereRaw(
          'unaccent(lower(u.user_principal_name)) like ?',
          [pattern]
        );
        if (skus.length) {
          // `IN (subconsulta)` NO correlacionada: PostgreSQL la resuelve una
          // sola vez (hash) — un EXISTS correlacionado dentro de un OR se
          // evalúa fila por fila y tarda segundos con decenas de miles.
          qb.orWhereIn(
            'u.id',
            db('m365_user_licenses as ul')
              .join('m365_licenses as l', 'l.id', 'ul.m365_license_id')
              .whereIn('l.sku_part_number', skus)
              .select('ul.m365_user_id')
          );
        }
      });
    }

    const countQuery = query.clone().count({ count: 'u.id' }).first();
    const rowsQuery = query
      .clone()
      .select(
        'u.id',
        'u.aad_object_id as aadObjectId',
        'u.display_name as displayName',
        'u.user_principal_name as userPrincipalName',
        'u.account_enabled as accountEnabled',
        'u.is_mfa_registered as isMfaRegistered',
        'u.is_mfa_capable as isMfaCapable',
        'u.methods_registered as methodsRegistered',
        'u.synced_at as syncedAt'
      )
      .orderBy([{ column: 'u.display_name' }, { column: 'u.id' }])
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ count }, users] = await Promise.all([countQuery, rowsQuery]);

    // Licencias solo de los usuarios de ESTA página (no de todo el tenant).
    const links = users.length
      ? await db('m365_user_licenses as ul')
          .join('m365_licenses as l', 'l.id', 'ul.m365_license_id')
          .whereIn('ul.m365_user_id', users.map((u) => u.id))
          .select('ul.m365_user_id as userId', 'l.sku_part_number as skuPartNumber')
      : [];
    const skusByUserId = new Map();
    for (const { userId, skuPartNumber } of links) {
      if (!skusByUserId.has(userId)) skusByUserId.set(userId, []);
      skusByUserId.get(userId).push(skuPartNumber);
    }

    return {
      items: users.map((u) => ({ ...u, licenses: skusByUserId.get(u.id) ?? [] })),
      pagination: {
        page,
        pageSize,
        total: Number(count),
        totalPages: Math.max(1, Math.ceil(Number(count) / pageSize)),
      },
    };
  },

  /** Totales de MFA de TODO el tenant sincronizado (no de la página). */
  async usersSummary() {
    const row = await db('m365_users')
      .select(
        db.raw('count(*) as total'),
        db.raw('count(*) filter (where is_mfa_registered = false) as "withoutMfa"'),
        db.raw('count(*) filter (where is_mfa_capable = false) as "notMfaCapable"'),
        db.raw('count(is_mfa_capable) as "withCapableData"'),
        db.raw('count(is_mfa_registered) as "withMfaData"')
      )
      .first();
    return {
      total: Number(row.total),
      withoutMfa: Number(row.withoutMfa),
      notMfaCapable: Number(row.notMfaCapable),
      hasCapableData: Number(row.withCapableData) > 0,
      withMfaData: Number(row.withMfaData),
    };
  },
};
