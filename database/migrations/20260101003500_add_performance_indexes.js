/**
 * Índices para volúmenes altos.
 *
 * - `audit_logs (action text_pattern_ops, occurred_at desc)`: las páginas
 *   de Auditoría por módulo filtran por prefijo de acción (`LIKE 'ad.%'`)
 *   y ordenan por fecha; un btree común no sirve para `LIKE 'x%'` sin
 *   `text_pattern_ops`. La tabla es inmutable y solo crece.
 * - FKs inversas sin índice (`m365_user_licenses.m365_license_id`,
 *   `user_roles.role_id`, `role_permissions.permission_id`): sin ellos,
 *   consultar "quién tiene esta licencia/rol/permiso" o borrar un rol
 *   recorre la tabla entera.
 * - `display_name` de m365_users/ad_users (orden de los listados) y un
 *   índice parcial de las cuentas bloqueadas (página Operaciones).
 *
 * CREATE INDEX CONCURRENTLY: no bloquea las escrituras mientras se
 * construye (importante en audit_logs, que recibe eventos todo el
 * tiempo) — por eso esta migración corre fuera de transacción.
 */

export const config = { transaction: false };

const INDEXES = [
  ['audit_logs_action_pattern_occurred_idx', 'audit_logs (action text_pattern_ops, occurred_at DESC)'],
  ['m365_user_licenses_license_id_idx', 'm365_user_licenses (m365_license_id)'],
  ['user_roles_role_id_idx', 'user_roles (role_id)'],
  ['role_permissions_permission_id_idx', 'role_permissions (permission_id)'],
  ['m365_users_display_name_idx', 'm365_users (display_name)'],
  ['ad_users_display_name_idx', 'ad_users (display_name)'],
  ['ad_users_locked_out_idx', 'ad_users (locked_out) WHERE locked_out'],
];

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  for (const [name, definition] of INDEXES) {
    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${definition}`);
  }
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  for (const [name] of INDEXES) {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
  }
}
