/**
 * constants/topology.js
 *
 * Categorías fijas del mapa de topología y los niveles de criticidad
 * predefinidos. Compartido entre el dashboard (topology.page.js) y el
 * ABM de administración (topology-admin.page.js) para que ambos queden
 * sincronizados si cambian colores o etiquetas.
 */

export const COLUMNS = [
  { title: 'Criticidad', color: '#e5484d' },
  { title: 'Aplicación', color: '#2E74B5' },
  { title: 'Base de Datos', color: '#d97706' },
  { title: 'Servidor / Instancia', color: '#059669' },
  { title: 'Datacenter / Nube', color: '#8b5cf6' },
];

export const CRIT_LEVELS = [
  { name: 'Crítico', color: '#e5484d' },
  { name: 'Alto', color: '#e08a2c' },
  { name: 'Medio', color: '#d4b106' },
  { name: 'Bajo', color: '#059669' },
];
