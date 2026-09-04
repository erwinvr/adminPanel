/**
 * Sincronización con ManageEngine Endpoint Central (parches pendientes
 * por equipo, ver backend/src/integrations/endpointCentral/). Mismo
 * patrón que Active Directory / Microsoft 365 / Backups: `vuln_settings`
 * es una fila única con los parámetros de conexión (API key cifrado,
 * nunca en texto plano); `vuln_computers` es una FOTO del último sync,
 * reemplazada entera en cada corrida.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('vuln_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('base_url', 255).nullable();
    table.text('api_key_encrypted').nullable();
    table.string('api_key_preview', 10).nullable();
    table.timestamp('last_synced_at', { useTz: true }).nullable();
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('updated_by').nullable().references('id').inTable('users');
  });

  await knex.schema.createTable('vuln_computers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('resource_id', 100).notNullable().unique();
    table.string('computer_name', 300).notNullable();
    table.integer('pending_patches_count').notNullable().defaultTo(0);
    table.timestamp('synced_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('pending_patches_count');
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('vuln_computers');
  await knex.schema.dropTableIfExists('vuln_settings');
}
