/**
 * Hash (SHA-256) del contenido de `config_output` en cada corrida
 * exitosa — permite contar "configuraciones únicas" por dispositivo
 * (COUNT DISTINCT sobre el hash, sin comparar el texto completo cada
 * vez) para la página Bitácora, sin tener que releer/comparar el texto
 * completo de configuración en cada consulta.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('netbackup_runs', (table) => {
    table.string('config_hash', 64).nullable();
  });
  await knex.raw('CREATE INDEX netbackup_runs_config_hash_idx ON netbackup_runs (device_id, config_hash)');
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('netbackup_runs', (table) => {
    table.dropColumn('config_hash');
  });
}
