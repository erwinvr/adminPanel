import { Layout } from '../components/Layout.js';
import { DataTable } from '../components/DataTable.js';
import { Pagination } from '../components/Pagination.js';
import { auditService } from '../services/audit.service.js';

let state = { page: 1, pageSize: 20 };

export async function renderAuditPage() {
  const root = document.getElementById('app');
  root.innerHTML = '';

  const content = document.createElement('div');
  content.innerHTML = '<h1>Registro de auditoría</h1>';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const actionFilter = document.createElement('input');
  actionFilter.type = 'text';
  actionFilter.placeholder = 'Filtrar por acción (ej. user.create)';
  actionFilter.addEventListener('change', () => {
    state.action = actionFilter.value || undefined;
    state.page = 1;
    refresh();
  });
  toolbar.appendChild(actionFilter);
  content.appendChild(toolbar);

  const tableContainer = document.createElement('div');
  content.appendChild(tableContainer);

  root.appendChild(Layout(content));

  async function refresh() {
    tableContainer.innerHTML = '<p>Cargando…</p>';
    try {
      const { data: logs, meta } = await auditService.list(state);
      tableContainer.innerHTML = '';

      tableContainer.appendChild(
        DataTable({
          columns: [
            { key: 'occurred_at', label: 'Fecha', render: (r) => new Date(r.occurred_at).toLocaleString('es-BO') },
            { key: 'user_username', label: 'Usuario', render: (r) => r.user_username ?? '—' },
            { key: 'action', label: 'Acción' },
            { key: 'resource', label: 'Recurso' },
            { key: 'result', label: 'Resultado', render: (r) => `<span class="badge badge--${r.result}">${r.result}</span>` },
            { key: 'ip_address', label: 'IP' },
          ],
          rows: logs,
          emptyMessage: 'No hay eventos de auditoría con estos filtros',
        })
      );

      tableContainer.appendChild(
        Pagination({
          page: meta.pagination.page,
          totalPages: meta.pagination.totalPages,
          onChange: (page) => {
            state.page = page;
            refresh();
          },
        })
      );
    } catch (err) {
      tableContainer.innerHTML = `<p class="alert alert--error">${err.message}</p>`;
    }
  }

  refresh();
}
