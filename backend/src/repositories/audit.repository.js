import { db } from '../config/database.js';

export const auditRepository = {
  /**
   * @param {object} entry
   * @param {import('knex').Knex.Transaction} [trx] - si se pasa, el insert
   *   participa de la misma transacción que el cambio que se está auditando.
   */
  insert(entry, trx = db) {
    return trx('audit_logs').insert(entry);
  },

  async list({ page, pageSize, userId, action, resource, from, to }) {
    const query = db('audit_logs as a')
      .leftJoin('users as u', 'u.id', 'a.user_id')
      .select(
        'a.id',
        'a.occurred_at',
        'a.user_id',
        'u.username as user_username',
        'a.action',
        'a.resource',
        'a.resource_id',
        'a.ip_address',
        'a.result',
        'a.metadata'
      );

    if (userId) query.andWhere('a.user_id', userId);
    if (action) query.andWhere('a.action', action);
    if (resource) query.andWhere('a.resource', resource);
    if (from) query.andWhere('a.occurred_at', '>=', from);
    if (to) query.andWhere('a.occurred_at', '<=', to);

    const countQuery = query.clone().clearSelect().clearOrder().count({ count: 'a.id' }).first();
    const rowsQuery = query
      .clone()
      .orderBy('a.occurred_at', 'desc')
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
