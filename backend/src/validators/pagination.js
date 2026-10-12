import Joi from 'joi';

/**
 * Fragmento `page`/`pageSize` idéntico en los 4 listados paginados del
 * lado del servidor (users, audit, m365 users, pam360 access requests)
 * — se combina con `Joi.object({ ...paginationSchema, ...resto })`.
 */
export const paginationSchema = {
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
};
