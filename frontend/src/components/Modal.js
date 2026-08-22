/**
 * components/Modal.js
 *
 * Modal genérico basado en <dialog> nativo. Recibe un nodo de contenido
 * ya construido (formularios, etc.) — no sabe nada de su contenido.
 */

export function openModal({ title, content, onClose }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';

  const header = document.createElement('div');
  header.className = 'modal__header';
  header.innerHTML = `<h3>${title}</h3>`;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal__close';
  closeBtn.setAttribute('aria-label', 'Cerrar');
  closeBtn.textContent = '×';
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'modal__body';
  body.appendChild(content);

  dialog.appendChild(header);
  dialog.appendChild(body);
  document.body.appendChild(dialog);

  function close() {
    dialog.close();
    dialog.remove();
    onClose?.();
  }

  closeBtn.addEventListener('click', close);
  dialog.addEventListener('cancel', close);

  dialog.showModal();

  return { close, dialog };
}
