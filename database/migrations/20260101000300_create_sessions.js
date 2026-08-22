/**
 * Tabla de sesiones para connect-pg-simple (session store en PostgreSQL).
 * Se crea explícitamente vía migración (en vez de dejar que la librería la
 * cree sola en runtime) para que el esquema quede versionado como el resto
 * de la base de datos. Estructura exigida por connect-pg-simple.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('sessions', (table) => {
    table.string('sid').primary();
    table.json('sess').notNullable();
    table.timestamp('expire', { precision: 6 }).notNullable();
  });
  await knex.raw('CREATE INDEX idx_sessions_expire ON sessions (expire)');
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('sessions');
}
