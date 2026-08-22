/**
 * components/DataTable.js
 *
 * Tabla genérica reutilizable. No sabe nada de usuarios/roles/auditoría
 * en particular — recibe columnas (con su propio render por celda) y
 * filas, y opcionalmente acciones por fila.
 *
 * @param {{
 *   columns: { key: string, label: string, render?: (row:object)=>string }[],
 *   rows: object[],
 *   actions?: { label: string, onClick: (row:object)=>void, variant?: string }[],
 *   emptyMessage?: string
 * }} params
 * @returns {HTMLElement}
 */
export function DataTable({ columns, rows, actions = [], emptyMessage = 'Sin resultados' }) {
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((col) => {
    const th = document.createElement('th');
    th.textContent = col.label;
    headRow.appendChild(th);
  });
  if (actions.length > 0) {
    const th = document.createElement('th');
    th.textContent = 'Acciones';
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columns.length + (actions.length > 0 ? 1 : 0);
    td.className = 'data-table__empty';
    td.textContent = emptyMessage;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    columns.forEach((col) => {
      const td = document.createElement('td');
      td.innerHTML = col.render ? col.render(row) : String(row[col.key] ?? '');
      tr.appendChild(td);
    });
    if (actions.length > 0) {
      const td = document.createElement('td');
      td.className = 'data-table__actions';
      actions.forEach((action) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn btn--sm ${action.variant ? `btn--${action.variant}` : 'btn--ghost'}`;
        btn.textContent = action.label;
        btn.addEventListener('click', () => action.onClick(row));
        td.appendChild(btn);
      });
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  return table;
}
