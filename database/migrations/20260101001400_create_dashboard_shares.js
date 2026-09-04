/**
 * Enlaces públicos de "Compartir" para los dashboards de solo lectura
 * (Mapa de aplicaciones, Proveedores y recursos, Usuarios). Quien tenga
 * el enlace ve los datos SIN autenticarse — por eso el token es
 * aleatorio de alta entropía (32 bytes, ver services/share.service.js)
 * y cada acceso público queda registrado (last_accessed_at,
 * access_count) además de auditado (dashboard_share.view en
 * audit_logs, con userId null igual que un login fallido de usuario
 * inexistente).
 *
 * Un solo enlace ACTIVO por dashboard a la vez (índice único parcial
 * sobre dashboard_key mientras revoked_at es null) — generar de nuevo
 * cuando ya hay uno activo devuelve el mismo enlace en vez de duplicar.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('dashboard_shares', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('dashboard_key', 50).notNullable();
    table.string('token', 64).notNullable().unique();
    table.uuid('created_by').nullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('revoked_at', { useTz: true }).nullable();
    table.timestamp('last_accessed_at', { useTz: true }).nullable();
    table.integer('access_count').notNullable().defaultTo(0);

    table.index('dashboard_key');
  });

  await knex.raw(
    'CREATE UNIQUE INDEX dashboard_shares_active_key_unique ON dashboard_shares (dashboard_key) WHERE revoked_at IS NULL'
  );
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('dashboard_shares');
}
