/**
 * Escapa texto libre antes de inyectarlo como HTML dentro de un
 * `render()` de DataTable (esas celdas se montan con
 * `dangerouslySetInnerHTML` — ver components/DataTable.jsx — así que
 * cualquier valor que venga de datos de usuario tiene que pasar por
 * acá primero para no habilitar XSS almacenado).
 */
export function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
