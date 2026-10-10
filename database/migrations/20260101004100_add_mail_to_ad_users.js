/**
 * 20260101004100_add_mail_to_ad_users.js
 *
 * El reporte "Usuarios de Active Directory" necesita el correo, que hasta
 * ahora no se leía de AD (ldapClient.js solo pedía sAMAccountName,
 * displayName/cn, whenCreated, lastLogonTimestamp, pwdLastSet,
 * userAccountControl, distinguishedName, lockoutTime). Se agrega la columna;
 * queda null hasta la próxima sincronización.
 */

export async function up(knex) {
  await knex.schema.alterTable('ad_users', (table) => {
    table.string('mail', 320);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('ad_users', (table) => {
    table.dropColumn('mail');
  });
}
