/**
 * Microsoft 365 → "Servicios M365": uso de SharePoint (por sitio) y de Teams
 * (por usuario y por equipo), de los informes de uso de Graph
 * (`Reports.Read.All`). Igual que m365_mailbox_usage/m365_onedrive_usage: una
 * FOTO reemplazada en cada descarga.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('m365_sharepoint_sites', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('site_id', 100).nullable();
    // "Site URL" viene vacío en muchos tenants: el sitio se identifica por el nombre de su propietario/grupo.
    table.string('site_url', 500).nullable();
    table.string('owner_display_name', 300).nullable();
    table.string('owner_principal_name', 320).nullable();
    table.string('root_web_template', 100).nullable(); // Group, Team site, Communication site…
    table.bigInteger('storage_used_bytes').notNullable().defaultTo(0);
    table.bigInteger('storage_allocated_bytes').nullable();
    table.bigInteger('file_count').nullable();
    table.bigInteger('page_view_count').nullable();
    table.date('last_activity_date').nullable();
    table.date('report_date').nullable();
    table.index('storage_used_bytes');
  });

  // Fuerza que la próxima sincronización baje también los informes nuevos (si no, esperaría hasta 6 h).
  await knex('m365_settings').update({ usage_reports_fetched_at: null });

  await knex.schema.createTable('m365_teams_user_activity', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('user_principal_name', 320).notNullable();
    table.integer('team_chat_messages').notNullable().defaultTo(0);
    table.integer('private_chat_messages').notNullable().defaultTo(0);
    table.integer('calls').notNullable().defaultTo(0);
    table.integer('meetings').notNullable().defaultTo(0);
    table.date('last_activity_date').nullable();
    table.date('report_date').nullable();
  });

  await knex.schema.createTable('m365_teams', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('team_id', 100).nullable();
    table.string('team_name', 300).nullable();
    table.string('team_type', 30).nullable(); // Public | Private
    table.integer('active_users').notNullable().defaultTo(0);
    table.integer('channel_messages').notNullable().defaultTo(0); // publicaciones + respuestas
    table.integer('meetings_organized').notNullable().defaultTo(0);
    table.integer('guests').notNullable().defaultTo(0);
    table.date('last_activity_date').nullable();
    table.date('report_date').nullable();
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('m365_teams');
  await knex.schema.dropTableIfExists('m365_teams_user_activity');
  await knex.schema.dropTableIfExists('m365_sharepoint_sites');
}
