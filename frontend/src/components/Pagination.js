/**
 * components/Pagination.js
 *
 * @param {{ page: number, totalPages: number, onChange: (page:number)=>void }} params
 * @returns {HTMLElement}
 */
export function Pagination({ page, totalPages, onChange }) {
  const el = document.createElement('div');
  el.className = 'pagination';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn--ghost';
  prevBtn.textContent = '‹ Anterior';
  prevBtn.disabled = page <= 1;
  prevBtn.addEventListener('click', () => onChange(page - 1));

  const label = document.createElement('span');
  label.className = 'pagination__label';
  label.textContent = `Página ${page} de ${totalPages}`;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn--ghost';
  nextBtn.textContent = 'Siguiente ›';
  nextBtn.disabled = page >= totalPages;
  nextBtn.addEventListener('click', () => onChange(page + 1));

  el.append(prevBtn, label, nextBtn);
  return el;
}
