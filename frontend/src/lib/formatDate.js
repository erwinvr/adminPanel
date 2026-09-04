/**
 * Formatea una fecha (columna DATE de Postgres, que llega serializada
 * como ISO string, ej. "2027-06-30T00:00:00.000Z") como día calendario
 * en es-BO — SIN pasar por `new Date(isoString)` a secas, porque eso
 * interpreta la cadena en UTC y `toLocaleDateString` la vuelve a
 * convertir a la hora local del navegador; para cualquier timezone
 * detrás de UTC (América, incluida Bolivia) el resultado cae un día
 * antes. Se arma la fecha a partir de año/mes/día en hora LOCAL para
 * que el día calendario nunca se corra.
 */
export function formatDate(isoDate) {
  if (!isoDate) return '—';
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-BO');
}
