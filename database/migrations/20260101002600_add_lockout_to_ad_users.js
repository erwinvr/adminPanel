/**
 * Active Directory → Operaciones: agrega el estado de bloqueo de
 * cuenta (lockout) a la foto sincronizada de `ad_users`, calculado
 * desde el atributo LDAP `lockoutTime` en cada sync (ver
 * backend/src/integrations/activeDirectory/ldapClient.js) —
 * `lockout_time` guarda cuándo se bloqueó (null = no bloqueado),
 * `locked_out` es el booleano derivado que usa la página nueva para
 * filtrar sin tener que comparar fechas en cada consulta.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('ad_users', (table) => {
    table.boolean('locked_out').notNullable().defaultTo(false);
    table.timestamp('lockout_time', { useTz: true }).nullable();
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('ad_users', (table) => {
    table.dropColumn('locked_out');
    table.dropColumn('lockout_time');
  });
}
