/**
 * 20260101004200_add_os_name_to_vuln_computers.js
 *
 * Para el gráfico "Dominio vs. agente de Endpoint Central por sistema
 * operativo" del dashboard UEM: hace falta saber el SO de cada equipo
 * reportado por Endpoint Central (antes no se guardaba).
 */

export async function up(knex) {
  await knex.schema.alterTable('vuln_computers', (table) => {
    table.string('os_name', 200);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('vuln_computers', (table) => {
    table.dropColumn('os_name');
  });
}
