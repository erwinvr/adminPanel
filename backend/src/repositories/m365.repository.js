import { db } from '../config/database.js';
import { createSettingsRepository } from './settings.js';
import { chunkedInsert, replaceTableContents } from './bulk.js';

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

  /**
   * Reemplaza la foto de cada informe de uso que venga en `reports` (mailboxes,
   * onedrive, sharepoint, teamsUsers, teams). Los que no vengan NO se tocan: si
   * un informe falla al descargarse, conserva su última foto en vez de borrarse.
   */
  async replaceUsageReports(reports) {
    const tables = {
      mailboxes: ['m365_mailbox_usage', (m) => ({ user_principal_name: m.userPrincipalName, display_name: m.displayName, storage_used_bytes: m.storageUsedBytes, quota_bytes: m.quotaBytes, item_count: m.itemCount, has_archive: m.hasArchive, last_activity_date: m.lastActivityDate, report_date: m.reportDate })],
      onedrive: ['m365_onedrive_usage', (o) => ({ user_principal_name: o.userPrincipalName, display_name: o.displayName, storage_used_bytes: o.storageUsedBytes, storage_allocated_bytes: o.storageAllocatedBytes, file_count: o.fileCount, last_activity_date: o.lastActivityDate, report_date: o.reportDate })],
      sharepoint: ['m365_sharepoint_sites', (x) => ({ site_id: x.siteId, site_url: x.siteUrl, owner_display_name: x.ownerDisplayName, owner_principal_name: x.ownerPrincipalName, root_web_template: x.rootWebTemplate, storage_used_bytes: x.storageUsedBytes, storage_allocated_bytes: x.storageAllocatedBytes, file_count: x.fileCount, page_view_count: x.pageViewCount, last_activity_date: x.lastActivityDate, report_date: x.reportDate })],
      teamsUsers: ['m365_teams_user_activity', (u) => ({ user_principal_name: u.userPrincipalName, team_chat_messages: u.teamChatMessages, private_chat_messages: u.privateChatMessages, calls: u.calls, meetings: u.meetings, last_activity_date: u.lastActivityDate, report_date: u.reportDate })],
      teams: ['m365_teams', (t) => ({ team_id: t.teamId, team_name: t.teamName, team_type: t.teamType, active_users: t.activeUsers, channel_messages: t.channelMessages, meetings_organized: t.meetingsOrganized, guests: t.guests, last_activity_date: t.lastActivityDate, report_date: t.reportDate })],
    };
    await db.transaction(async (trx) => {
      for (const [key, [table, toRow]] of Object.entries(tables)) {
        if (reports[key]) await replaceTableContents(trx, table, reports[key].map(toRow));
      }
    });
  },

  /**
   * Resumen de uso de Servicios M365, todo calculado en SQL: los `limit` mayores
   * de buzones / OneDrive / sitios de SharePoint / usuarios y equipos de Teams,
   * más los totales de cada uno.
   */
  async getServicesUsage(limit = 10) {
    const day = (column, alias) => db.raw(`to_char(${column}, 'YYYY-MM-DD') as "${alias}"`);
    const num = (v) => (v == null ? null : Number(v));
    const withPct = (rows, capacityKey) =>
      rows.map((r) => {
        const used = Number(r.usedBytes);
        const capacity = num(r[capacityKey]);
        return { ...r, usedBytes: used, [capacityKey]: capacity, itemCount: num(r.itemCount), fileCount: num(r.fileCount), pctUsed: capacity ? (used / capacity) * 100 : null };
      });

    // Buzones y OneDrive: por usuario, ordenados por espacio usado.
    const storageSection = async (table, extraColumns) => {
      const [totals, top] = await Promise.all([
        db(table).select(db.raw('count(*) as total'), db.raw('coalesce(sum(storage_used_bytes), 0) as "totalUsedBytes"'), db.raw(`to_char(max(report_date), 'YYYY-MM-DD') as "reportDate"`)).first(),
        db(table)
          .select('user_principal_name as userPrincipalName', 'display_name as displayName', 'storage_used_bytes as usedBytes', db.raw(`to_char(last_activity_date, 'YYYY-MM-DD') as "lastActivityDate"`), ...extraColumns)
          .orderBy([{ column: 'storage_used_bytes', order: 'desc' }, { column: 'user_principal_name' }])
          .limit(limit),
      ]);
      return { total: Number(totals.total), totalUsedBytes: Number(totals.totalUsedBytes), reportDate: totals.reportDate, top };
    };

    const [mailboxes, onedrive] = await Promise.all([
      storageSection('m365_mailbox_usage', ['quota_bytes as quotaBytes', 'item_count as itemCount', 'has_archive as hasArchive']),
      storageSection('m365_onedrive_usage', ['storage_allocated_bytes as allocatedBytes', 'file_count as fileCount']),
    ]);
    mailboxes.top = withPct(mailboxes.top, 'quotaBytes');
    onedrive.top = withPct(onedrive.top, 'allocatedBytes');

    // SharePoint: por sitio.
    const [spTotals, spTop] = await Promise.all([
      db('m365_sharepoint_sites')
        .select(
          db.raw('count(*) as total'),
          db.raw('coalesce(sum(storage_used_bytes), 0) as "totalUsedBytes"'),
          db.raw('coalesce(sum(file_count), 0) as "totalFiles"'),
          // Sin actividad hace más de 180 días (o nunca), respecto de la fecha del informe.
          db.raw('count(*) filter (where last_activity_date is null or last_activity_date < report_date - 180) as "inactive"'),
          db.raw(`to_char(max(report_date), 'YYYY-MM-DD') as "reportDate"`)
        )
        .first(),
      db('m365_sharepoint_sites')
        .select('owner_display_name as name', 'owner_principal_name as ownerPrincipalName', 'root_web_template as template', 'site_url as siteUrl', 'storage_used_bytes as usedBytes', 'storage_allocated_bytes as allocatedBytes', 'file_count as fileCount', 'page_view_count as pageViewCount', day('last_activity_date', 'lastActivityDate'))
        .orderBy([{ column: 'storage_used_bytes', order: 'desc' }, { column: 'owner_display_name' }])
        .limit(limit),
    ]);
    const sharepoint = {
      total: Number(spTotals.total),
      totalUsedBytes: Number(spTotals.totalUsedBytes),
      totalFiles: Number(spTotals.totalFiles),
      inactive: Number(spTotals.inactive),
      reportDate: spTotals.reportDate,
      top: withPct(spTop, 'allocatedBytes'),
    };

    // Teams: totales por usuario + top de usuarios + equipos (públicos/privados) y top de equipos.
    const activity = 'team_chat_messages + private_chat_messages + calls + meetings';
    const [tuTotals, tuTop, tTotals, tTop] = await Promise.all([
      db('m365_teams_user_activity')
        .select(
          db.raw('count(*) as "totalUsers"'),
          db.raw(`count(*) filter (where ${activity} > 0) as "activeUsers"`),
          db.raw('coalesce(sum(team_chat_messages + private_chat_messages), 0) as "messages"'),
          db.raw('coalesce(sum(calls), 0) as "calls"'),
          db.raw('coalesce(sum(meetings), 0) as "meetings"'),
          db.raw(`to_char(max(report_date), 'YYYY-MM-DD') as "reportDate"`)
        )
        .first(),
      db('m365_teams_user_activity')
        .select('user_principal_name as userPrincipalName', 'team_chat_messages as teamChatMessages', 'private_chat_messages as privateChatMessages', 'calls', 'meetings', db.raw(`(${activity}) as "activity"`), day('last_activity_date', 'lastActivityDate'))
        .whereRaw(`${activity} > 0`)
        .orderBy([{ column: 'activity', order: 'desc' }, { column: 'user_principal_name' }])
        .limit(limit),
      db('m365_teams')
        .select(
          db.raw('count(*) as "total"'),
          db.raw(`count(*) filter (where team_type = 'Public') as "publicTeams"`),
          db.raw(`count(*) filter (where team_type = 'Private') as "privateTeams"`),
          db.raw('coalesce(sum(guests), 0) as "guests"'),
          db.raw('count(*) filter (where active_users > 0 or channel_messages > 0 or meetings_organized > 0) as "activeTeams"'),
          db.raw(`to_char(max(report_date), 'YYYY-MM-DD') as "reportDate"`)
        )
        .first(),
      db('m365_teams')
        .select('team_name as name', 'team_type as teamType', 'active_users as activeUsers', 'channel_messages as channelMessages', 'meetings_organized as meetingsOrganized', 'guests', day('last_activity_date', 'lastActivityDate'))
        .where(db.raw('active_users > 0 or channel_messages > 0 or meetings_organized > 0'))
        .orderBy([{ column: 'active_users', order: 'desc' }, { column: 'channel_messages', order: 'desc' }, { column: 'meetings_organized', order: 'desc' }, { column: 'team_name' }])
        .limit(limit),
    ]);
    const teams = {
      users: { total: Number(tuTotals.totalUsers), active: Number(tuTotals.activeUsers), messages: Number(tuTotals.messages), calls: Number(tuTotals.calls), meetings: Number(tuTotals.meetings), reportDate: tuTotals.reportDate },
      topUsers: tuTop.map((u) => ({ ...u, activity: Number(u.activity) })),
      teams: { total: Number(tTotals.total), public: Number(tTotals.publicTeams), private: Number(tTotals.privateTeams), guests: Number(tTotals.guests), active: Number(tTotals.activeTeams), reportDate: tTotals.reportDate },
      topTeams: tTop,
    };

    return { mailboxes, onedrive, sharepoint, teams };
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
