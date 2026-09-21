/**
 * Veeam: frecuencia de sincronización automática (minutos entre corridas
 * en segundo plano, ver backend/src/jobs/syncScheduler.js) — mismo
 * criterio que ad_settings/m365_settings. NULL o 0 = sin sincronización
 * automática, solo el botón "Sincronizar ahora".
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('backup_settings', (table) => {
    table.integer('sync_interval_minutes').nullable();
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('backup_settings', (table) => {
    table.dropColumn('sync_interval_minutes');
  });
}
