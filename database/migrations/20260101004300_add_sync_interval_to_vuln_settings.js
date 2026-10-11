/**
 * 20260101004300_add_sync_interval_to_vuln_settings.js
 *
 * Sincronización automática de UEM (Endpoint Central), mismo criterio que
 * ad_settings/m365_settings/backup_settings/pam360_settings — ver
 * jobs/syncScheduler.js. 0/null = desactivada (solo manual).
 */

export async function up(knex) {
  await knex.schema.alterTable('vuln_settings', (table) => {
    table.integer('sync_interval_minutes');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('vuln_settings', (table) => {
    table.dropColumn('sync_interval_minutes');
  });
}
