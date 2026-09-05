/**
 * Configuración del servidor SMTP saliente (sección "Configuración" →
 * SMTP) — fila única, mismo criterio que ad_settings/m365_settings
 * (contraseña cifrada, nunca en texto plano). La usan tanto el correo
 * de "olvidé mi contraseña" (utils/mailer.js) como cualquier otro envío
 * transaccional futuro.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('smtp_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('host', 255).nullable();
    table.integer('port').nullable();
    table.boolean('secure').notNullable().defaultTo(false); // true = TLS implícito (puerto 465)
    table.string('username', 255).nullable();
    table.text('password_encrypted').nullable();
    table.string('password_preview', 10).nullable();
    table.string('from_email', 255).nullable();
    table.string('from_name', 200).nullable();
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('updated_by').nullable().references('id').inTable('users');
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('smtp_settings');
}
