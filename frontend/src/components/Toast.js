/**
 * components/Toast.js
 *
 * Notificaciones efímeras (éxito/error). API mínima: toast.success(msg),
 * toast.error(msg). Crea su propio contenedor en el DOM la primera vez
 * que se usa (patrón singleton simple, sin necesidad de que cada página
 * lo monte manualmente).
 */

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

function show(message, variant) {
  const el = ensureContainer();
  const toastEl = document.createElement('div');
  toastEl.className = `toast toast--${variant}`;
  toastEl.textContent = message;
  el.appendChild(toastEl);

  requestAnimationFrame(() => toastEl.classList.add('toast--visible'));

  setTimeout(() => {
    toastEl.classList.remove('toast--visible');
    setTimeout(() => toastEl.remove(), 200);
  }, 4000);
}

export const toast = {
  success: (message) => show(message, 'success'),
  error: (message) => show(message, 'error'),
  info: (message) => show(message, 'info'),
};
