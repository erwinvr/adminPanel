/** Fecha y hora local (es-BO); `empty` es lo que se muestra si no hay fecha. */
export function formatDateTime(iso, empty = '—') {
  if (!iso) return empty;
  return new Date(iso).toLocaleString('es-BO');
}

/** Igual que formatDateTime, pero "Nunca" si no hay fecha (última sincronización, último uso). */
export function formatDateTimeOrNever(iso) {
  return formatDateTime(iso, 'Nunca');
}
