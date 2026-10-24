/**
 * 20260101004600_add_on_premises_domain_name_to_m365_users.js
 *
 * `onPremisesDomainName` (Microsoft Graph): dominio de Active Directory
 * on-premises del que viene sincronizada la cuenta (vía Entra Connect) —
 * null en cuentas nativas de la nube. Se agrega la columna; queda null
 * hasta la próxima sincronización.
 */

export async function up(knex) {
  await knex.schema.alterTable('m365_users', (table) => {
    table.string('on_premises_domain_name', 300);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('m365_users', (table) => {
    table.dropColumn('on_premises_domain_name');
  });
}
