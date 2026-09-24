import { db } from '../config/database.js';
import { AUDIT_MODULES, INTEGRATION_PREFIXES, EXCLUDED_EVERYWHERE } from '../audit/auditModules.js';

export const auditRepository = {
  /**
   * @param {object} entry
   * @param {import('knex').Knex.Transaction} [trx] - si se pasa, el insert
   *   participa de la misma transacción que el cambio que se está auditando.
   */
  insert(entry, trx = db) {
    return trx('audit_logs').insert(entry);
  },

  async list({ page, pageSize, userId, module = 'application', action, resource, from, to }) {
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

    // Los eventos "netbackup.*" ya guardados no se pueden borrar de la
    // tabla (`audit_logs` es inmutable por diseño: trigger de PostgreSQL
    // que rechaza UPDATE/DELETE — ver migración 20260101000500); se
    // excluyen acá, en la consulta, no en el dato subyacente.
    for (const prefix of EXCLUDED_EVERYWHERE) query.andWhereNot('a.action', 'ilike', `${prefix}.%`);

    const modulePrefix = AUDIT_MODULES[module];
    if (modulePrefix) {
      query.andWhere('a.action', 'ilike', `${modulePrefix}.%`);
    } else {
      // 'application': todo lo que no es de una integración.
      for (const prefix of Object.values(INTEGRATION_PREFIXES)) query.andWhereNot('a.action', 'ilike', `${prefix}.%`);
    }

    if (userId) query.andWhere('a.user_id', userId);
    // ILIKE (contiene, sin distinguir mayúsculas) en vez de igualdad exacta
    // — el filtro es un buscador de texto libre (ej. "auth" debe encontrar
    // "auth.login", "auth.logout", etc.), no un selector de código exacto.
    if (action) query.andWhereILike('a.action', `%${action}%`);
    if (resource) query.andWhereILike('a.resource', `%${resource}%`);
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
