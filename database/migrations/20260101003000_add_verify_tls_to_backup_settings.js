/**
 * Veeam: agrega `verify_tls` a `backup_settings`. Veeam Backup & Replication
 * expone su REST API (puerto 9419) con un certificado AUTOFIRMADO por
 * defecto, que Node rechaza (DEPTH_ZERO_SELF_SIGNED_CERT). Por defecto
 * sigue verificando (true, seguro); quien tenga el certificado
 * autofirmado puede desactivarlo desde Veeam → Configuración.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('backup_settings', (table) => {
    table.boolean('verify_tls').notNullable().defaultTo(true);
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('backup_settings', (table) => {
    table.dropColumn('verify_tls');
  });
}
