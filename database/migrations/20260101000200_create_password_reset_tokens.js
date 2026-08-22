/**
 * Tokens de recuperación de contraseña. Se almacena SOLO el hash del
 * token (nunca el valor original) — igual criterio que las contraseñas:
 * si la tabla se filtrara, los tokens no serían reutilizables.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('password_reset_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('token_hash').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('used_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('user_id');
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('password_reset_tokens');
}
