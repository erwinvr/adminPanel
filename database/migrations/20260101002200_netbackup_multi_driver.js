/**
 * "Backup Networking" pasa a soportar más de un mecanismo de extracción
 * (`driver`): el original por SSH + comando de texto (`raw_ssh`, ahora
 * el default explícito, preserva el comportamiento de los dispositivos
 * ya configurados) y dos nuevos que se resuelven vía un microservicio
 * Python aparte (ver backend/src/integrations/networkBackup/
 * microserviceClient.js): `napalm_ios` (Cisco IOS/IOS-XE, vía NAPALM)
 * y `fortios_api` (FortiGate/FortiOS, vía su API REST nativa — NAPALM
 * no tiene driver mantenido para Fortinet).
 *
 * Las columnas `ssh_*` se renombran a genéricas porque ya no describen
 * solo SSH: `fortios_api` se autentica por REST con el mismo par
 * usuario/contraseña, no por SSH. `command` pasa a nullable — solo
 * tiene sentido para `raw_ssh`, los otros dos drivers no necesitan un
 * comando manual.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.alterTable('netbackup_devices', (table) => {
    table.renameColumn('ssh_port', 'port');
    table.renameColumn('ssh_username', 'username');
    table.renameColumn('ssh_password_encrypted', 'password_encrypted');
    table.renameColumn('ssh_password_preview', 'password_preview');
  });

  await knex.schema.alterTable('netbackup_devices', (table) => {
    table.string('driver', 20).notNullable().defaultTo('raw_ssh');
    table.string('command', 300).nullable().alter();
  });

  await knex.raw(
    "ALTER TABLE netbackup_devices ADD CONSTRAINT netbackup_devices_driver_check " +
      "CHECK (driver IN ('raw_ssh', 'napalm_ios', 'fortios_api'))"
  );
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.raw('ALTER TABLE netbackup_devices DROP CONSTRAINT netbackup_devices_driver_check');

  await knex.schema.alterTable('netbackup_devices', (table) => {
    table.dropColumn('driver');
    table.string('command', 300).notNullable().defaultTo('/export').alter();
  });

  await knex.schema.alterTable('netbackup_devices', (table) => {
    table.renameColumn('port', 'ssh_port');
    table.renameColumn('username', 'ssh_username');
    table.renameColumn('password_encrypted', 'ssh_password_encrypted');
    table.renameColumn('password_preview', 'ssh_password_preview');
  });
}
