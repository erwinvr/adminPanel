/**
 * PAM360 manda las fechas como texto de hora LOCAL de su servidor, sin
 * zona horaria ("Dec 30, 2025 04:45 PM"), y el backend corre en UTC:
 * sin saber en qué zona está el servidor de PAM360 las horas del
 * reporte se ven corridas. Se guarda la zona (nombre IANA, ej.
 * "America/La_Paz") para convertirlas correctamente a UTC al sincronizar.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('pam360_settings', (table) => {
    table.string('timezone', 64).notNullable().defaultTo('UTC');
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('pam360_settings', (table) => {
    table.dropColumn('timezone');
  });
}
