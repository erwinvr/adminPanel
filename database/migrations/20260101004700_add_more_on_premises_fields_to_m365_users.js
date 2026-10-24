/**
 * 20260101004700_add_more_on_premises_fields_to_m365_users.js
 *
 * Resto de los atributos on-premises de Microsoft Graph (junto con
 * `onPremisesDomainName`, agregado en la migración anterior): el DN, el
 * sAMAccountName y el UPN que tenía la cuenta en el AD on-premises antes
 * de sincronizarse (pueden diferir del UPN de nube), y si la sincronización
 * vía Entra Connect está habilitada para esa cuenta — null en cuentas
 * nativas de la nube. Se agregan las columnas; quedan null hasta la
 * próxima sincronización.
 */

export async function up(knex) {
  await knex.schema.alterTable('m365_users', (table) => {
    table.string('on_premises_distinguished_name', 700);
    table.string('on_premises_sam_account_name', 200);
    table.string('on_premises_user_principal_name', 300);
    table.boolean('on_premises_sync_enabled');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('m365_users', (table) => {
    table.dropColumn('on_premises_distinguished_name');
    table.dropColumn('on_premises_sam_account_name');
    table.dropColumn('on_premises_user_principal_name');
    table.dropColumn('on_premises_sync_enabled');
  });
}
