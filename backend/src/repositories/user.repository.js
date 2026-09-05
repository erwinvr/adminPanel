/**
 * repositories/user.repository.js
 *
 * Única capa que ejecuta consultas SQL (vía Knex) sobre la tabla `users`.
 * Los services nunca importan `db` directamente — siempre pasan por aquí.
 * Todas las consultas usan el query builder de Knex (parametrizado),
 * nunca concatenación de strings — así se evita SQL Injection por diseño.
 */

import { db } from '../config/database.js';

const TABLE = 'users';

const PUBLIC_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'username',
  'email',
  'status',
  'must_change_password',
  'created_at',
  'updated_at',
];

export const userRepository = {
  /** @returns {Promise<object|undefined>} incluye password_hash — solo para auth */
  findByUsernameOrEmailWithSecrets(identifier) {
    return db(TABLE)
      .where('username', identifier)
      .orWhere('email', identifier.toLowerCase())
      .first();
  },

  findByIdWithSecrets(id) {
    return db(TABLE).where({ id }).first();
  },

  findById(id) {
    return db(TABLE).select(PUBLIC_COLUMNS).where({ id }).first();
  },

  existsByUsernameOrEmail(username, email, excludeId = null) {
    // Agrupado explícitamente: sin este callback, Knex genera
    // "WHERE username = ? OR email = ? AND id != ?", y por precedencia de
    // operadores SQL (AND antes que OR) el excludeId solo protege la mitad
    // del email — la comparación de username siempre matchea al propio
    // usuario que se está editando, y el conflicto da falso positivo en
    // cualquier update.
    const query = db(TABLE).where((qb) => {
      qb.where('username', username).orWhere('email', email.toLowerCase());
    });
    if (excludeId) query.andWhereNot('id', excludeId);
    return query.first().then(Boolean);
  },

  create(userData, trx = db) {
    return trx(TABLE)
      .insert({ ...userData, email: userData.email.toLowerCase() })
      .returning(PUBLIC_COLUMNS)
      .then(([row]) => row);
  },

  update(id, changes, trx = db) {
    const payload = { ...changes, updated_at: trx.fn.now() };
    if (payload.email) payload.email = payload.email.toLowerCase();
    return trx(TABLE)
      .where({ id })
      .update(payload)
      .returning(PUBLIC_COLUMNS)
      .then(([row]) => row);
  },

  /**
   * Listado paginado con búsqueda y filtros — la paginación se resuelve
   * en el backend (LIMIT/OFFSET), nunca se devuelve la tabla completa.
   * @param {{ page: number, pageSize: number, search?: string, status?: string, sortBy?: string, sortDir?: 'asc'|'desc' }} params
   */
  async list({ page, pageSize, search, status, sortBy = 'created_at', sortDir = 'desc' }) {
    const ALLOWED_SORT_COLUMNS = new Set(['created_at', 'username', 'email', 'last_name', 'status']);
    const sortColumn = ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : 'created_at';

    const baseQuery = db(TABLE);
    if (search) {
      baseQuery.where((qb) => {
        qb.whereILike('username', `%${search}%`)
          .orWhereILike('email', `%${search}%`)
          .orWhereILike('first_name', `%${search}%`)
          .orWhereILike('last_name', `%${search}%`);
      });
    }
    if (status) {
      baseQuery.andWhere('status', status);
    }

    const countQuery = baseQuery.clone().count({ count: '*' }).first();
    const rowsQuery = baseQuery
      .clone()
      .select(PUBLIC_COLUMNS)
      .orderBy(sortColumn, sortDir === 'asc' ? 'asc' : 'desc')
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

  incrementFailedLogin(id, trx = db) {
    return trx(TABLE).where({ id }).increment('failed_login_count', 1);
  },

  resetFailedLogin(id, trx = db) {
    return trx(TABLE).where({ id }).update({ failed_login_count: 0, locked_until: null });
  },

  lockUntil(id, until, trx = db) {
    return trx(TABLE).where({ id }).update({ status: 'locked', locked_until: until });
  },

  unlock(id, trx = db) {
    return trx(TABLE)
      .where({ id })
      .update({ status: 'active', locked_until: null, failed_login_count: 0 });
  },
};
