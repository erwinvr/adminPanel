/**
 * 20260101004400_add_scan_fields_to_vuln_computers.js
 *
 * Para los reportes de UEM (sección Reportes): Endpoint Central ya
 * entrega estos campos en el mismo `patch/allsystems` que se usa hoy,
 * solo faltaba guardarlos — ver docs/uem.md.
 */

export async function up(knex) {
  await knex.schema.alterTable('vuln_computers', (table) => {
    table.timestamp('last_successful_scan', { useTz: true });
    table.timestamp('agent_last_contact_time', { useTz: true });
    table.integer('critical_patch_count').notNullable().defaultTo(0);
    table.integer('important_patch_count').notNullable().defaultTo(0);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('vuln_computers', (table) => {
    table.dropColumn('last_successful_scan');
    table.dropColumn('agent_last_contact_time');
    table.dropColumn('critical_patch_count');
    table.dropColumn('important_patch_count');
  });
}
