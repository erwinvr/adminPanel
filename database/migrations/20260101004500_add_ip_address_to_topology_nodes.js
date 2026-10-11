/**
 * 20260101004500_add_ip_address_to_topology_nodes.js
 *
 * Atributo "Dirección IP" para las cajas de Servidor/Instancia del mapa de
 * topología. Columna genérica (sirve para cualquier categoría a nivel de
 * esquema/base, igual que `sub`/`color`), pero el formulario y el mapa solo
 * la muestran para Servidor/Instancia — ver TopologyAdminPage.jsx.
 */

export async function up(knex) {
  await knex.schema.alterTable('topology_nodes', (table) => {
    table.string('ip_address', 45);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('topology_nodes', (table) => {
    table.dropColumn('ip_address');
  });
}
