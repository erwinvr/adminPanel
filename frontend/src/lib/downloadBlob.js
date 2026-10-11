/**
 * lib/downloadBlob.js
 *
 * Dispara la descarga de un Blob en el navegador (link temporal invisible +
 * click programático) — usado por la exportación CSV de Reportes y por la
 * plantilla/exportación del ABM del mapa de topología.
 */
export function downloadBlob({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
