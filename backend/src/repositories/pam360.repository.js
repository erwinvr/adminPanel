import { db } from '../config/database.js';

export const pam360Repository = {
  getSettings() {
    return db('pam360_settings').first();
  },

  async upsertSettings(changes) {
    const existing = await db('pam360_settings').first();
    if (existing) {
      const [row] = await db('pam360_settings').where({ id: existing.id }).update(changes).returning('*');
      return row;
    }
    const [row] = await db('pam360_settings').insert(changes).returning('*');
    return row;
  },

  // A diferencia de AD/Veeam (foto reemplazada entera en cada sync),
  // acá se acumula — ver comentario en la migración.
  upsertAccessRequests(rows) {
    if (!rows.length) return Promise.resolve();
    return db('pam360_access_requests').insert(rows).onConflict('pam360_request_id').merge();
  },

  async listAccessRequests({ page, pageSize, search, from, to }) {
    const query = db('pam360_access_requests').select(
      'id',
      'pam360_request_id',
      'requester_username',
      'requester_fullname',
      'resource_name',
      'account_name',
      'reason',
      'status',
      'requested_at',
      'start_time',
      'end_time'
    );

    // Un solo buscador de texto libre que matchea CUALQUIERA de estos
    // campos (OR) — no AND, que nunca matchearía nada salvo que el
    // mismo término apareciera en los dos campos a la vez.
    if (search) {
      query.andWhere((qb) => {
        qb.orWhereILike('requester_username', `%${search}%`)
          .orWhereILike('requester_fullname', `%${search}%`)
          .orWhereILike('resource_name', `%${search}%`)
          .orWhereILike('account_name', `%${search}%`);
      });
    }
    if (from) query.andWhere('requested_at', '>=', from);
    if (to) query.andWhere('requested_at', '<=', to);

    const countQuery = query.clone().clearSelect().clearOrder().count({ count: 'id' }).first();
    const rowsQuery = query
      .clone()
      .orderBy('requested_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ count }, rows] = await Promise.all([countQuery, rowsQuery]);

    return {
      items: rows,
      pagination: {
        page,
        pageSize,
        total: Number(count),
        totalPages: Math.max(1, Math.ceil(Number(count) / pageSize)),
      },
    };
  },
};
