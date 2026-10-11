/**
 * topology/categories.js
 *
 * Copia intencional de `frontend/src/constants/topology.js` (igual criterio
 * que permissions/catalog.js: dos runtimes separados, no se puede importar
 * directo). Se usa para interpretar la columna "Categoría" del CSV de
 * importación de cajas — si se agrega/renombra una categoría ahí, replicar
 * acá también.
 */

export const COLUMN_TITLES = ['Criticidad', 'Aplicación', 'Base de Datos', 'Servidor / Instancia', 'Datacenter / Nube'];

export const CRIT_LEVELS = [
  { name: 'Crítico', color: '#FF4757' },
  { name: 'Alto', color: '#FF8C42' },
  { name: 'Medio', color: '#FFD23F' },
  { name: 'Bajo', color: '#00D4B5' },
];

/** Sin mayúsculas ni tildes, para comparar nombres de categoría/nivel escritos a mano en un CSV. */
export function normalizeText(s) {
  return (s ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
