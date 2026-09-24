/**
 * Microsoft 365: filtro de dominios de la sincronización.
 *
 * - `allowed_domains`: dominios (del UPN) cuyos usuarios se admiten en
 *   el sync; vacío/NULL = se admiten todos. El resto se ignora.
 * - `detected_domains`: cantidad de usuarios por dominio vistos en el
 *   último sync sobre TODO el tenant (antes de filtrar), para que en la
 *   configuración se pueda elegir qué dominios admitir.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('m365_settings', (table) => {
    table.specificType('allowed_domains', 'text[]').nullable();
    table.jsonb('detected_domains').nullable();
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('m365_settings', (table) => {
    table.dropColumn('allowed_domains');
    table.dropColumn('detected_domains');
  });
}
