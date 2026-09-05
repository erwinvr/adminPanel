/**
 * IP de administración de cada equipo del inventario (ej. la IP de la
 * interfaz iDRAC/iLO/BMC de un servidor, o la IP de gestión de un
 * switch) — opcional, no todo el hardware tiene una interfaz de
 * administración separada de su IP de datos.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('hardware_inventory', (table) => {
    table.string('management_ip', 45).nullable();
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('hardware_inventory', (table) => {
    table.dropColumn('management_ip');
  });
}
