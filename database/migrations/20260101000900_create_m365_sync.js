/**
 * Sincronización con Microsoft 365 (Microsoft Graph API, client
 * credentials flow — ver backend/src/integrations/microsoft365/).
 *
 * `m365_settings` es una tabla de una sola fila (parámetros de
 * conexión: tenant, client ID y client secret CIFRADO, nunca en texto
 * plano — ver utils/crypto.js). `m365_licenses`/`m365_users`/
 * `m365_user_licenses` son una FOTO (snapshot) del último sync: en
 * cada sincronización se reemplaza todo el contenido de esas tres
 * tablas dentro de una transacción — no son un espejo incremental, son
 * un caché de solo lectura de lo que hay en Microsoft 365 en ese
 * momento.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('m365_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('tenant_id', 200).nullable();
    table.string('client_id', 200).nullable();
    table.text('client_secret_encrypted').nullable();
    table.string('client_secret_preview', 10).nullable(); // solo los últimos caracteres, para mostrar en la UI sin exponer el secreto
    table.timestamp('last_synced_at', { useTz: true }).nullable();
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('updated_by').nullable().references('id').inTable('users');
  });

  await knex.schema.createTable('m365_licenses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('sku_id', 100).notNullable().unique(); // GUID de Microsoft — se guarda como string opaco, no se valida formato
    table.string('sku_part_number', 200).notNullable();
    table.integer('enabled_units').notNullable().defaultTo(0);
    table.integer('consumed_units').notNullable().defaultTo(0);
    table.timestamp('synced_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('m365_users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('aad_object_id', 100).notNullable().unique();
    table.string('display_name', 300).nullable();
    table.string('user_principal_name', 300).nullable();
    table.boolean('account_enabled').notNullable().defaultTo(true);
    table.timestamp('synced_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('m365_user_licenses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('m365_user_id').notNullable().references('id').inTable('m365_users').onDelete('CASCADE');
    table.uuid('m365_license_id').notNullable().references('id').inTable('m365_licenses').onDelete('CASCADE');

    table.unique(['m365_user_id', 'm365_license_id']);
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('m365_user_licenses');
  await knex.schema.dropTableIfExists('m365_users');
  await knex.schema.dropTableIfExists('m365_licenses');
  await knex.schema.dropTableIfExists('m365_settings');
}
