import { db } from '../config/database.js';
import { createSettingsRepository } from './settings.js';
import { chunkedInsert } from './bulk.js';

export const pam360Repository = {
  ...createSettingsRepository('pam360_settings'),

  // A diferencia de AD/Veeam (foto reemplazada entera en cada sync),
  // acá se acumula — ver comentario en la migración.
  upsertAccessRequests(rows) {
    // Un mismo ID repetido dentro de UN insert hace fallar el ON CONFLICT
    // ("cannot affect row a second time") — se deja la última aparición.
    const unique = [...new Map(rows.map((r) => [r.pam360_request_id, r])).values()];
    return chunkedInsert(db, 'pam360_access_requests', unique, { onConflict: 'pam360_request_id' });
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
