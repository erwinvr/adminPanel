/**
 * Compliance para "Backup Networking": reglas de texto/regex evaluadas
 * contra `netbackup_runs.config_output` — la única forma de evaluar
 * algo uniforme entre los 3 drivers (raw_ssh, napalm_ios, fortios_api),
 * ya que solo NAPALM da datos estructurados (`facts`) y ni Mikrotik ni
 * FortiGate los tienen. Ver backend/src/services/compliance.service.js.
 *
 * `compliance_results` guarda SOLO el estado actual (una fila por par
 * regla×dispositivo, no un historial de cada corrida) — se sobrescribe
 * (upsert) cada vez que hay una corrida nueva o se edita la regla. Si
 * en el futuro se quiere ver tendencia histórica, ahí sí habría que
 * sumar una tabla de historial aparte; por ahora la pregunta que
 * responde esta tabla es "¿estoy cumpliendo AHORA?", no "¿desde cuándo
 * dejé de cumplir?".
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('compliance_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 200).notNullable();
    table.text('description').nullable();
    // null = aplica a cualquier driver — la sintaxis de una regla
    // ("no debe contener 'telnet'") a veces es igual en cualquier
    // fabricante, pero muchas reglas dependen del dialecto de config
    // de cada uno.
    table.string('driver', 20).nullable();
    table.string('mode', 10).notNullable().defaultTo('text');
    table.string('match_type', 20).notNullable();
    table.text('pattern').notNullable();
    table.boolean('case_sensitive').notNullable().defaultTo(false);
    table.string('severity', 20).notNullable().defaultTo('warning');
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('created_by').nullable().references('id').inTable('users');
    table.uuid('updated_by').nullable().references('id').inTable('users');

    table.check("driver IN ('raw_ssh', 'napalm_ios', 'fortios_api')", [], 'compliance_rules_driver_check');
    table.check("mode IN ('text', 'regex')", [], 'compliance_rules_mode_check');
    table.check("match_type IN ('must_contain', 'must_not_contain')", [], 'compliance_rules_match_type_check');
    table.check("severity IN ('info', 'warning', 'critical')", [], 'compliance_rules_severity_check');
  });

  await knex.schema.createTable('compliance_results', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('rule_id').notNullable().references('id').inTable('compliance_rules').onDelete('CASCADE');
    table.uuid('device_id').notNullable().references('id').inTable('netbackup_devices').onDelete('CASCADE');
    table.uuid('run_id').notNullable().references('id').inTable('netbackup_runs').onDelete('CASCADE');
    table.boolean('passed').notNullable();
    table.text('matched_snippet').nullable();
    table.timestamp('evaluated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['rule_id', 'device_id']); // "solo estado actual": upsert, no historial
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('compliance_results');
  await knex.schema.dropTableIfExists('compliance_rules');
}
