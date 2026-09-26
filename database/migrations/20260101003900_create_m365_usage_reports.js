/**
 * Microsoft 365 → "Servicios M365": uso de buzones de correo y de OneDrive por
 * usuario, tomado de los informes de uso de Graph (`Reports.Read.All`). Igual
 * que el resto de las sincronizaciones, es una FOTO reemplazada en cada
 * refresco (los informes los actualiza Microsoft una vez por día, así que se
 * vuelven a bajar como máximo cada pocas horas — ver m365.service.js).
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('m365_mailbox_usage', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('user_principal_name', 320).notNullable();
    table.string('display_name', 300).nullable();
    table.bigInteger('storage_used_bytes').notNullable().defaultTo(0);
    table.bigInteger('quota_bytes').nullable(); // "Prohibit Send/Receive Quota": al llegar acá el buzón deja de recibir
    table.bigInteger('item_count').nullable();
    table.boolean('has_archive').notNullable().defaultTo(false);
    table.date('last_activity_date').nullable();
    table.date('report_date').nullable();
    table.index('storage_used_bytes');
  });

  await knex.schema.createTable('m365_onedrive_usage', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('user_principal_name', 320).notNullable();
    table.string('display_name', 300).nullable();
    table.bigInteger('storage_used_bytes').notNullable().defaultTo(0);
    table.bigInteger('storage_allocated_bytes').nullable();
    table.bigInteger('file_count').nullable();
    table.date('last_activity_date').nullable();
    table.date('report_date').nullable();
    table.index('storage_used_bytes');
  });

  await knex.schema.alterTable('m365_settings', (table) => {
    table.timestamp('usage_reports_fetched_at', { useTz: true }).nullable();
    // Aviso de la última descarga de informes (permiso faltante, nombres ocultos…); null = sin novedades.
    table.text('usage_reports_note').nullable();
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('m365_settings', (table) => {
    table.dropColumn('usage_reports_fetched_at');
    table.dropColumn('usage_reports_note');
  });
  await knex.schema.dropTableIfExists('m365_onedrive_usage');
  await knex.schema.dropTableIfExists('m365_mailbox_usage');
}
