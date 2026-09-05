/**
 * "Backup Networking": respaldo de configuración de equipos de
 * networking vía SSH (ver backend/src/integrations/networkBackup/).
 *
 * `netbackup_devices` vincula UN dispositivo del inventario de hardware
 * (hardware_inventory, tipo 'networking') con sus credenciales SSH,
 * el comando a ejecutar para extraer la config y la frecuencia del job
 * automático — mismo criterio que ad_settings/m365_settings
 * (contraseña cifrada, 0/null de frecuencia = solo manual). Se borra en
 * cascada si se borra el hardware o si se borra el dispositivo (no
 * tiene sentido un backup de config de un equipo que ya no existe en
 * el inventario).
 *
 * `netbackup_runs` es el historial de ejecuciones: una fila por cada
 * intento (manual o automático), con el resultado y la config extraída
 * completa en `config_output` cuando tuvo éxito — a diferencia de las
 * "fotos" de AD/M365 (que reemplazan todo en cada sync), acá cada
 * corrida se conserva como su propia versión histórica, porque el
 * valor de un backup de config está justamente en poder ver versiones
 * anteriores.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('netbackup_devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('hardware_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('hardware_inventory')
      .onDelete('CASCADE');
    table.integer('ssh_port').notNullable().defaultTo(22);
    table.string('ssh_username', 200).notNullable();
    table.text('ssh_password_encrypted').notNullable();
    table.string('ssh_password_preview', 10).nullable();
    table.string('command', 300).notNullable().defaultTo('/export');
    table.integer('sync_interval_minutes').nullable();
    table.timestamp('last_run_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('created_by').nullable().references('id').inTable('users');
    table.uuid('updated_by').nullable().references('id').inTable('users');
  });

  await knex.schema.createTable('netbackup_runs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('device_id').notNullable().references('id').inTable('netbackup_devices').onDelete('CASCADE');
    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('finished_at', { useTz: true }).nullable();
    table.string('result', 20).notNullable(); // 'success' | 'failure'
    table.text('error_message').nullable();
    table.text('config_output').nullable();
    table.string('trigger', 20).notNullable(); // 'manual' | 'scheduled'
    table.uuid('triggered_by').nullable().references('id').inTable('users');

    table.check("result IN ('success', 'failure')", [], 'netbackup_runs_result_check');
    table.check("trigger IN ('manual', 'scheduled')", [], 'netbackup_runs_trigger_check');
    table.index(['device_id', 'started_at']);
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('netbackup_runs');
  await knex.schema.dropTableIfExists('netbackup_devices');
}
