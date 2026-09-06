/**
 * integrations/networkBackup/drivers.js
 *
 * Catálogo de drivers de "Backup Networking" y la única decisión que
 * se repetía como comparación literal (`driver === 'raw_ssh'`) en el
 * validador y el servicio: si el driver necesita un `command` manual
 * (solo `raw_ssh`) o no (napalm_ios/fortios_api resuelven la
 * extracción del lado del microservicio, sin comando).
 */

export const RAW_SSH_DRIVER = 'raw_ssh';
export const NETBACKUP_DRIVERS = [RAW_SSH_DRIVER, 'napalm_ios', 'fortios_api'];

export function driverRequiresCommand(driver) {
  return driver === RAW_SSH_DRIVER;
}
