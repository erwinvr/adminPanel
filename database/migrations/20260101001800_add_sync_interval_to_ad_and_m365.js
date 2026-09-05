/**
 * Frecuencia de sincronización automática para Active Directory y
 * Microsoft 365 (ver backend/src/jobs/syncScheduler.js) — minutos entre
 * corridas automáticas. NULL o 0 = sin sincronización automática, solo
 * el botón "Sincronizar ahora" de cada página de Configuración.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('ad_settings', (table) => {
    table.integer('sync_interval_minutes').nullable();
  });
  await knex.schema.alterTable('m365_settings', (table) => {
    table.integer('sync_interval_minutes').nullable();
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('ad_settings', (table) => {
    table.dropColumn('sync_interval_minutes');
  });
  await knex.schema.alterTable('m365_settings', (table) => {
    table.dropColumn('sync_interval_minutes');
  });
}
