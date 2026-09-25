/**
 * Backup Networking: deja de guardar la configuración completa en CADA
 * corrida. Con un backup cada pocos minutos, casi todas las corridas
 * repiten la misma configuración (medido: 3.465 corridas, 5 configs
 * distintas, 26 MB de texto) y la tabla crece sin techo.
 *
 * Ahora hay UNA fila por configuración distinta (`netbackup_configs`,
 * única por dispositivo + hash normalizado — el que ya ignora líneas
 * volátiles como timestamps, ver configNormalizer.js) y cada corrida la
 * referencia con `config_id`. Se conserva el texto de la PRIMERA vez que
 * se vio esa configuración; las corridas posteriores con el mismo hash
 * difieren del guardado solo en líneas volátiles, y el momento de cada
 * corrida sigue en `started_at`.
 *
 * Nota de espacio: soltar la columna es instantáneo pero PostgreSQL
 * devuelve el espacio recién al reescribir la tabla — correr una vez
 * `VACUUM FULL netbackup_runs;` (ver docs/deployment.md).
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('netbackup_configs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('device_id').notNullable().references('id').inTable('netbackup_devices').onDelete('CASCADE');
    table.string('config_hash', 64).notNullable();
    table.text('config_output').notNullable();
    table.timestamp('first_seen_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_seen_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['device_id', 'config_hash']);
  });

  await knex.schema.alterTable('netbackup_runs', (table) => {
    table.uuid('config_id').nullable().references('id').inTable('netbackup_configs').onDelete('SET NULL');
    table.index('config_id');
  });

  // La primera configuración vista de cada (dispositivo, hash).
  await knex.raw(`
    INSERT INTO netbackup_configs (device_id, config_hash, config_output, first_seen_at, last_seen_at)
    SELECT device_id, config_hash, (array_agg(config_output ORDER BY started_at))[1], min(started_at), max(started_at)
    FROM netbackup_runs
    WHERE config_hash IS NOT NULL AND config_output IS NOT NULL
    GROUP BY device_id, config_hash
  `);
  await knex.raw(`
    UPDATE netbackup_runs r SET config_id = c.id
    FROM netbackup_configs c
    WHERE c.device_id = r.device_id AND c.config_hash = r.config_hash
      AND r.config_hash IS NOT NULL AND r.config_output IS NOT NULL
  `);

  // Ninguna corrida con texto puede quedar sin enlazar: si pasara, se
  // aborta la migración (transaccional) antes de perder el dato.
  const orphaned = await knex('netbackup_runs').whereNotNull('config_output').whereNull('config_id').count({ n: '*' }).first();
  if (Number(orphaned.n) > 0) {
    throw new Error(`Migración abortada: ${orphaned.n} corridas con configuración no pudieron enlazarse a netbackup_configs`);
  }

  await knex.schema.alterTable('netbackup_runs', (table) => {
    table.dropColumn('config_output');
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('netbackup_runs', (table) => {
    table.text('config_output').nullable();
  });
  await knex.raw(`
    UPDATE netbackup_runs r SET config_output = c.config_output
    FROM netbackup_configs c WHERE c.id = r.config_id
  `);
  await knex.schema.alterTable('netbackup_runs', (table) => {
    table.dropIndex('config_id');
    table.dropColumn('config_id');
  });
  await knex.schema.dropTable('netbackup_configs');
}
