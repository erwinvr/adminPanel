/**
 * lib/copyToClipboard.js
 *
 * Copia texto al portapapeles. `navigator.clipboard` SOLO existe en
 * contextos seguros (HTTPS o localhost): el panel se sirve normalmente
 * por HTTP en la red interna (http://<ip>:8080), donde esa API es
 * `undefined` y el botón "Copiar" fallaba siempre. En ese caso se usa
 * el plan B clásico: seleccionar el texto de un campo visible y
 * `document.execCommand('copy')`, que sí funciona sin HTTPS.
 *
 * @param {string} text
 * @param {string} [fallbackInputId] id de un <input> visible que ya muestra `text`
 *   (para el plan B). Si el plan B también falla, el campo queda seleccionado
 *   para que el usuario pueda copiar con Ctrl+C.
 * @returns {Promise<boolean>} true si se copió
 */
export async function copyToClipboard(text, fallbackInputId) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* permiso denegado: se prueba el plan B */
    }
  }

  const input = fallbackInputId ? document.getElementById(fallbackInputId) : null;
  if (!input) return false;
  input.focus();
  input.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}
