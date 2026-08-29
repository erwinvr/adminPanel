/**
 * Estado de MFA por usuario, traído del reporte de Microsoft Graph
 * `/reports/authenticationMethods/userRegistrationDetails` (requiere el
 * permiso de aplicación AuditLog.Read.All, adicional a los ya usados
 * para licencias/usuarios — ver integrations/microsoft365/graphClient.js).
 *
 * Todas las columnas son NULLABLE a propósito: si el tenant no otorgó
 * ese permiso, el sync de licencias/usuarios sigue funcionando igual y
 * estas columnas simplemente quedan en null (se distingue de
 * `false` — "no tiene MFA" es un dato, "no sabemos" es otro).
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('m365_users', (table) => {
    table.boolean('is_mfa_registered').nullable();
    table.boolean('is_mfa_capable').nullable();
    table.jsonb('methods_registered').nullable();
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('m365_users', (table) => {
    table.dropColumn('is_mfa_registered');
    table.dropColumn('is_mfa_capable');
    table.dropColumn('methods_registered');
  });
}
