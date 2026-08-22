/**
 * Tabla de usuarios. El hash de contraseña usa Argon2id (ver
 * backend/src/auth/password.js) — nunca se almacena en texto plano.
 * `status` + soft delete: no hay eliminación física, solo desactivación,
 * para preservar la integridad referencial de auditoría.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('username', 50).notNullable().unique();
    table.string('email', 255).notNullable().unique();
    table.text('password_hash').notNullable();
    table.string('status', 20).notNullable().defaultTo('active'); // active | inactive | locked
    table.integer('failed_login_count').notNullable().defaultTo(0);
    table.timestamp('locked_until', { useTz: true }).nullable();
    table.boolean('must_change_password').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('created_by').nullable().references('id').inTable('users');
    table.uuid('updated_by').nullable().references('id').inTable('users');

    table.check("status IN ('active', 'inactive', 'locked')", [], 'users_status_check');
  });

  await knex.raw(`
    ALTER TABLE users
      ADD CONSTRAINT users_email_lowercase_check CHECK (email = lower(email))
  `);
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('users');
}
