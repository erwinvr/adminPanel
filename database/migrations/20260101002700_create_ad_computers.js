/**
 * Active Directory → "Equipos del AD": objetos `computer` sincronizados
 * desde el mismo Active Directory que ya se usa para usuarios (mismo
 * `ad_settings`, misma corrida de sync — ver ad.service.js#sync). Igual
 * criterio que `ad_users`: es una FOTO completa reemplazada en cada
 * sync, no un espejo incremental.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('ad_computers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('distinguished_name', 700).notNullable().unique();
    table.string('name', 200).nullable();
    table.string('dns_host_name', 300).nullable();
    table.string('operating_system', 200).nullable();
    table.string('operating_system_version', 100).nullable();
    table.timestamp('ad_created_at', { useTz: true }).nullable();
    table.timestamp('last_login_at', { useTz: true }).nullable();
    table.boolean('enabled').notNullable().defaultTo(true);
    table.timestamp('synced_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('operating_system');
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('ad_computers');
}
