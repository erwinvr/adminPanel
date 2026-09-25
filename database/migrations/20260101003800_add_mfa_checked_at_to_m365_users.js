/**
 * Microsoft 365 → MFA incremental: cuándo se leyó por última vez el MFA de
 * cada usuario. Leer los métodos de autenticación es lento (Microsoft limita
 * la tasa: ~2-3 usuarios/s sostenidos → ~20 minutos para 3.300 usuarios), así
 * que cada sincronización solo vuelve a consultar a quien nunca se leyó o
 * tiene el dato viejo, y conserva el dato anterior del resto.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('m365_users', (table) => {
    table.timestamp('mfa_checked_at', { useTz: true }).nullable();
  });
  // Lo ya sincronizado con MFA se considera leído en su último sync.
  await knex.raw('UPDATE m365_users SET mfa_checked_at = synced_at WHERE is_mfa_registered IS NOT NULL');
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.alterTable('m365_users', (table) => {
    table.dropColumn('mfa_checked_at');
  });
}
