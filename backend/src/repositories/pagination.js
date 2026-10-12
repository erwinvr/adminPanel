/**
 * repositories/pagination.js
 *
 * `LIMIT/OFFSET` + el objeto `pagination` de la respuesta son idénticos
 * en los 4 repositorios que paginan del lado del servidor (users, audit,
 * m365 users, pam360 access requests) — el resto de cada consulta
 * (columnas, joins, filtros) sigue siendo propio de cada uno.
 */

/** @param {import('knex').Knex.QueryBuilder} query */
export function paginate(query, { page, pageSize }) {
  return query.limit(pageSize).offset((page - 1) * pageSize);
}

export function buildPaginationMeta({ page, pageSize, count }) {
  return {
    page,
    pageSize,
    total: Number(count),
    totalPages: Math.max(1, Math.ceil(Number(count) / pageSize)),
  };
}
