/**
 * "Topología de Red": dashboard que infiere heurísticamente cómo se
 * interconectan los equipos de networking a partir de las subredes IP
 * declaradas en sus configs ya respaldadas (ver
 * backend/src/integrations/networkBackup/topologyParser.js). Solo
 * participan del grafo los equipos que el administrador marca a
 * propósito con este flag — no todo el inventario de tipo
 * "networking" automáticamente.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('hardware_inventory', (table) => {
    table.boolean('include_in_topology').notNullable().defaultTo(false);
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('hardware_inventory', (table) => {
    table.dropColumn('include_in_topology');
  });
}
