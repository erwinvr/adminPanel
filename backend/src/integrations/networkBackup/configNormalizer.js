/**
 * integrations/networkBackup/configNormalizer.js
 *
 * Los 3 fabricantes soportados embeben ALGO volátil (timestamp o
 * contador de guardado) en el header/pie de la config que exportan,
 * sin que represente ningún cambio real de intención — si se hashea/
 * diffea el texto crudo tal cual, CADA backup se ve como una config
 * nueva aunque no haya cambiado nada:
 *
 *  - Mikrotik (`raw_ssh`, `/export`): primera línea
 *    "# <timestamp> by RouterOS <versión>", distinta en cada export.
 *  - Cisco IOS/IOS-XE (`napalm_ios`, show running-config):
 *    "! Last configuration change at ..." (se registra sola en cada
 *    consulta) y "ntp clock-period <n>" (IOS reescribe esta línea solo
 *    por deriva del reloj cuando hay NTP configurado — causa clásica
 *    de "diffs falsos" en backups de Cisco).
 *  - FortiGate/FortiOS (`fortios_api`, backup REST):
 *    "#conf_file_ver=<n>" — contador interno que FortiOS incrementa en
 *    cada guardado a flash, incluso por guardados internos del sistema
 *    sin cambios visibles para un admin.
 *
 * Esta normalización SOLO se usa para calcular `config_hash` y para el
 * diff de Bitácora — el texto crudo (`config_output`) se guarda y se
 * descarga sin tocar, porque es el respaldo real y restaurable.
 */

const VOLATILE_LINE_PATTERNS = {
  raw_ssh: [/^# .*by RouterOS.*$/gm],
  napalm_ios: [
    /^! Last configuration change at .*$/gm,
    /^! NVRAM config last updated at .*$/gm,
    /^ntp clock-period \d+$/gm,
    /^Current configuration : \d+ bytes$/gm,
  ],
  fortios_api: [/^#conf_file_ver=\d+$/gm],
};

/**
 * @param {string} driver
 * @param {string} configText
 * @returns {string}
 */
export function normalizeForHash(driver, configText) {
  const patterns = VOLATILE_LINE_PATTERNS[driver] ?? [];
  return patterns.reduce((text, pattern) => text.replace(pattern, ''), configText);
}
