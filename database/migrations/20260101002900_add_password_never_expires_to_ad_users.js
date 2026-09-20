/**
 * Active Directory → Usuarios del AD: agrega a la foto sincronizada de
 * `ad_users` si la cuenta tiene marcada "La contraseña nunca expira"
 * — bit ADS_UF_DONT_EXPIRE_PASSWD (0x10000) de `userAccountControl`,
 * calculado en cada sync (ver
 * backend/src/integrations/activeDirectory/ldapClient.js). Se usa como
 * filtro en la página, para poder auditar rápido qué cuentas quedaron
 * con la contraseña sin vencimiento.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('ad_users', (table) => {
    table.boolean('password_never_expires').notNullable().defaultTo(false);
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('ad_users', (table) => {
    table.dropColumn('password_never_expires');
  });
}
