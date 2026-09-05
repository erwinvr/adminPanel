/**
 * Opciones de frecuencia para el job de sincronización automática de
 * Active Directory / Microsoft 365 (ver backend/src/jobs/syncScheduler.js).
 * Valores en minutos, como string porque el <Select> de Form.jsx los
 * necesita así — se convierten a número recién al armar el payload.
 */
export const SYNC_FREQUENCY_OPTIONS = [
  { value: '0', label: 'Manual (sin sincronización automática)' },
  { value: '15', label: 'Cada 15 minutos' },
  { value: '30', label: 'Cada 30 minutos' },
  { value: '60', label: 'Cada hora' },
  { value: '360', label: 'Cada 6 horas' },
  { value: '720', label: 'Cada 12 horas' },
  { value: '1440', label: 'Cada 24 horas' },
];
