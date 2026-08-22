/**
 * components/ConfirmDialog.js
 *
 * Diálogo de confirmación basado en <dialog> nativo. Devuelve una
 * Promise<boolean> — patrón usado en vez de callbacks para que las
 * páginas puedan hacer `if (await confirmDialog(...)) { ... }`.
 */

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = `
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="confirm-dialog__actions">
        <button type="button" class="btn btn--ghost" data-action="cancel">Cancelar</button>
        <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-action="confirm">${confirmLabel}</button>
      </div>
    `;
    document.body.appendChild(dialog);

    function cleanup(result) {
      dialog.close();
      dialog.remove();
      resolve(result);
    }

    dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false));
    dialog.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(true));
    dialog.addEventListener('cancel', () => cleanup(false)); // tecla Escape

    dialog.showModal();
  });
}
