/**
 * Sincronización con Veeam Backup & Replication (REST API v1, ver
 * backend/src/integrations/veeam/veeamClient.js). Mismo patrón que
 * Active Directory / Microsoft 365: `backup_settings` es una fila
 * única con los parámetros de conexión (contraseña cifrada, nunca en
 * texto plano); `backup_jobs`/`backup_repositories` son una FOTO del
 * último sync, reemplazada entera en cada corrida.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('backup_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('base_url', 255).nullable();
    table.string('username', 200).nullable();
    table.text('password_encrypted').nullable();
    table.string('password_preview', 10).nullable();
    table.timestamp('last_synced_at', { useTz: true }).nullable();
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('updated_by').nullable().references('id').inTable('users');
  });

  await knex.schema.createTable('backup_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('veeam_job_id', 100).notNullable().unique();
    table.string('name', 300).notNullable();
    // 'Success' | 'Warning' | 'Failed' | 'None' (sin ejecuciones todavía)
    table.string('last_status', 20).nullable();
    table.timestamp('last_run_at', { useTz: true }).nullable();
    table.timestamp('synced_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('backup_repositories', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('veeam_repository_id', 100).notNullable().unique();
    table.string('name', 300).notNullable();
    table.bigInteger('capacity_bytes').nullable();
    table.bigInteger('free_bytes').nullable();
    table.timestamp('synced_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('backup_repositories');
  await knex.schema.dropTableIfExists('backup_jobs');
  await knex.schema.dropTableIfExists('backup_settings');
}
