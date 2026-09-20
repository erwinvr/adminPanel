/**
 * Active Directory → Administradores del AD: agrega a la foto
 * sincronizada de `ad_users` los grupos privilegiados a los que
 * pertenece cada usuario (Domain Admins, Enterprise Admins, Schema
 * Admins, Administrators — ver PRIVILEGED_GROUP_NAMES en
 * backend/src/integrations/activeDirectory/ldapClient.js), calculado
 * en cada sync vía una búsqueda LDAP de pertenencia RECURSIVA
 * (incluye admins que llegan por un grupo anidado, no solo miembros
 * directos). Array vacío/null = sin privilegios de administrador.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('ad_users', (table) => {
    table.specificType('privileged_groups', 'text[]').nullable();
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('ad_users', (table) => {
    table.dropColumn('privileged_groups');
  });
}
