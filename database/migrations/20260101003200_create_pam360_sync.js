/**
 * Sincronización con ManageEngine PAM360 (ver
 * backend/src/integrations/pam360/pam360Client.js). `pam360_settings`
 * es una fila única con los parámetros de conexión (AUTHTOKEN cifrado,
 * nunca en texto plano), mismo patrón que `ad_settings`/`backup_settings`.
 *
 * `pam360_access_requests` NO sigue el patrón "foto reemplazada en
 * cada sync" de `ad_users`/`backup_jobs` — acá se ACUMULA (upsert por
 * `pam360_request_id`, nunca se borra). La documentación pública de la
 * API no aclara si el endpoint de solicitudes devuelve el historial
 * completo o solo las abiertas; acumular es seguro en cualquiera de
 * los dos casos, mientras que reemplazar perdería el historial si la
 * API solo devuelve lo pendiente.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('pam360_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('base_url', 255).nullable();
    table.text('auth_token_encrypted').nullable();
    table.string('auth_token_preview', 10).nullable();
    table.boolean('verify_tls').notNullable().defaultTo(true);
    table.integer('sync_interval_minutes').nullable();
    table.timestamp('last_synced_at', { useTz: true }).nullable();
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('updated_by').nullable().references('id').inTable('users');
  });

  await knex.schema.createTable('pam360_access_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // "PASSWD ID" en la respuesta de PAM360 — natural, aparentemente
    // único por solicitud puntual (no por cuenta/recurso).
    table.string('pam360_request_id', 100).notNullable().unique();
    table.string('requester_username', 200).nullable();
    table.string('requester_fullname', 200).nullable();
    table.string('resource_name', 300).nullable();
    table.string('account_name', 300).nullable();
    table.text('reason').nullable();
    table.string('status', 100).nullable();
    table.timestamp('requested_at', { useTz: true }).nullable();
    // Ventana de acceso SOLICITADA (lo que el usuario pidió al crear la
    // solicitud) — PAM360 no expone en este endpoint el checkout/checkin
    // real, ver docs/pam360.md.
    table.timestamp('start_time', { useTz: true }).nullable();
    table.timestamp('end_time', { useTz: true }).nullable();
    table.timestamp('synced_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index('requested_at');
    table.index('requester_username');
    table.index('resource_name');
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('pam360_access_requests');
  await knex.schema.dropTableIfExists('pam360_settings');
}
