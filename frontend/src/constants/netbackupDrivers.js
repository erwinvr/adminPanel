// Cómo se extrae la config de cada dispositivo — ver
// backend/src/services/netbackup.service.js#runBackup para el dispatch
// real. 'raw_ssh' sigue resolviéndose en el backend Node; los otros dos
// pasan por el microservicio Python `netbackup-agent` (NAPALM para
// Cisco, API REST nativa para FortiGate — Fortinet no tiene driver
// NAPALM mantenido).
export const NETBACKUP_DRIVER_OPTIONS = [
  { value: 'raw_ssh', label: 'Genérico — SSH + comando (Mikrotik, etc.)' },
  { value: 'napalm_ios', label: 'Cisco IOS / IOS-XE (NAPALM)' },
  { value: 'fortios_api', label: 'FortiGate / FortiOS (API REST)' },
];

export function netbackupDriverLabel(value) {
  return NETBACKUP_DRIVER_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
