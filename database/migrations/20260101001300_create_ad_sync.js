/**
 * Sincronización con un Active Directory on-prem (LDAP/LDAPS, bind
 * simple con cuenta de servicio — ver
 * backend/src/integrations/activeDirectory/ldapClient.js). Mismo
 * patrón que Microsoft 365 (ver 20260101000900_create_m365_sync.js):
 * `ad_settings` es una fila única con los parámetros de conexión (la
 * contraseña del bind DN, cifrada — nunca en texto plano); `ad_users`
 * es una FOTO del último sync, reemplazada entera en cada corrida, no
 * un espejo incremental.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('ad_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('host', 255).nullable();
    table.integer('port').nullable();
    table.boolean('use_tls').notNullable().defaultTo(false);
    table.string('bind_dn', 500).nullable();
    table.text('bind_password_encrypted').nullable();
    table.string('bind_password_preview', 10).nullable(); // solo los últimos caracteres, para la UI
    table.string('base_dn', 500).nullable();
    table.timestamp('last_synced_at', { useTz: true }).nullable();
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('updated_by').nullable().references('id').inTable('users');
  });

  await knex.schema.createTable('ad_users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // DN en vez de objectGUID — ver comentario en ldapClient.js.
    table.string('distinguished_name', 700).notNullable().unique();
    table.string('sam_account_name', 200).nullable();
    table.string('display_name', 300).nullable();
    table.timestamp('ad_created_at', { useTz: true }).nullable();
    table.timestamp('last_login_at', { useTz: true }).nullable();
    table.timestamp('password_last_set_at', { useTz: true }).nullable();
    table.boolean('enabled').notNullable().defaultTo(true);
    table.timestamp('synced_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('ad_users');
  await knex.schema.dropTableIfExists('ad_settings');
}
