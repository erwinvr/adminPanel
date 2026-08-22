/**
 * Tabla de auditoría, diseñada para que un usuario normal (y, en la
 * práctica, incluso un bug en el código de la aplicación) no pueda
 * modificarla ni borrarla:
 *
 *  - No hay endpoint de UPDATE/DELETE para audit_logs en ningún nivel de
 *    la aplicación (solo existe `create` en el repositorio).
 *  - Como defensa en profundidad adicional, se agrega un trigger a nivel
 *    de PostgreSQL que RECHAZA cualquier UPDATE o DELETE sobre la tabla,
 *    sin importar qué rol de base de datos lo intente (incluyendo el
 *    propio owner) — así la inmutabilidad no depende únicamente de que
 *    el código de la aplicación se comporte correctamente.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('user_id').nullable().references('id').inTable('users');
    table.string('action', 100).notNullable(); // ej. 'auth.login', 'user.create'
    table.string('resource', 100).notNullable(); // ej. 'user', 'role'
    table.string('resource_id', 100).nullable();
    table.specificType('ip_address', 'inet').nullable();
    table.text('user_agent').nullable();
    table.string('result', 20).notNullable(); // 'success' | 'failure'
    table.jsonb('metadata').nullable();

    table.index('occurred_at');
    table.index('user_id');
    table.index('action');
    table.check("result IN ('success', 'failure')", [], 'audit_logs_result_check');
  });

  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_logs_immutable()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_logs es de solo inserción: % no está permitido', TG_OP;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
  `);

  await knex.raw(`
    CREATE TRIGGER audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
  `);
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS audit_logs_no_delete ON audit_logs');
  await knex.raw('DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs');
  await knex.raw('DROP FUNCTION IF EXISTS audit_logs_immutable');
  await knex.schema.dropTableIfExists('audit_logs');
}
