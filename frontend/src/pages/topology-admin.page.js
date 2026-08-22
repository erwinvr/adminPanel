/**
 * pages/topology-admin.page.js
 *
 * ABM (alta / baja / modificación) de las cajas que aparecen en el
 * mapa de topología (dashboard de solo lectura + conexiones en
 * topology.page.js). Acá se administran las cajas de cada categoría
 * fija (Criticidad, Aplicación, Base de Datos, Servidor/Instancia,
 * Datacenter/Nube) — el mapa ya no tiene controles de alta/baja de
 * cajas para no saturar la vista.
 *
 * Requiere topology.edit (misma regla que el resto de la edición del
 * mapa) — el router y el nav ya bloquean el acceso sin ese permiso;
 * acá además se ocultan los botones de alta/editar/eliminar por si
 * alguien llega con topology.view solamente.
 */

import { auth } from '../auth/session.js';
import { Layout } from '../components/Layout.js';
import { DataTable } from '../components/DataTable.js';
import { Form } from '../components/Form.js';
import { openModal } from '../components/Modal.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { toast } from '../components/Toast.js';
import { topologyService } from '../services/topology.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { COLUMNS, CRIT_LEVELS } from '../constants/topology.js';

let nodes = [];
let categoryFilter = '';

export async function renderTopologyAdminPage() {
  const root = document.getElementById('app');
  root.innerHTML = '';
  const canEdit = auth.hasPermission(PERMISSIONS.TOPOLOGY_EDIT);
  categoryFilter = '';

  const content = document.createElement('div');
  content.innerHTML = `
    <h1>Administración de Topología</h1>
    <p class="topology-page__hint">Alta, baja y modificación de las cajas de cada categoría (Criticidad, Aplicación, Base de Datos, Servidor/Instancia, Datacenter/Nube). Las conexiones entre cajas se gestionan desde el mapa de topología.</p>
  `;

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const filterSelect = document.createElement('select');
  filterSelect.innerHTML =
    '<option value="">Todas las categorías</option>' +
    COLUMNS.map((c, i) => `<option value="${i}">${c.title}</option>`).join('');
  filterSelect.value = categoryFilter;
  filterSelect.addEventListener('change', () => {
    categoryFilter = filterSelect.value;
    renderTable();
  });
  toolbar.appendChild(filterSelect);

  if (canEdit) {
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn btn--primary';
    createBtn.textContent = '+ Nueva caja';
    createBtn.addEventListener('click', () => openNodeForm());
    toolbar.appendChild(createBtn);
  }

  content.appendChild(toolbar);

  const tableContainer = document.createElement('div');
  content.appendChild(tableContainer);

  root.appendChild(Layout(content));

  async function refresh() {
    tableContainer.innerHTML = '<p>Cargando…</p>';
    try {
      const graph = await topologyService.getGraph();
      nodes = graph.nodes;
      renderTable();
    } catch (err) {
      tableContainer.innerHTML = `<p class="alert alert--error">${err.message}</p>`;
    }
  }

  function renderTable() {
    const filtered = categoryFilter === '' ? nodes : nodes.filter((n) => String(n.col) === categoryFilter);
    const sorted = [...filtered].sort((a, b) => a.col - b.col || a.name.localeCompare(b.name));

    const actions = [];
    if (canEdit) {
      actions.push({ label: 'Editar', onClick: (row) => openNodeForm(row) });
      actions.push({
        label: 'Eliminar',
        variant: 'danger',
        onClick: async (row) => {
          const ok = await confirmDialog({
            title: 'Eliminar caja',
            message: `¿Eliminar "${row.name}"? También se eliminarán sus conexiones en el mapa.`,
            confirmLabel: 'Eliminar',
            danger: true,
          });
          if (!ok) return;
          try {
            await topologyService.deleteNode(row.id);
            toast.success('Caja eliminada');
            refresh();
          } catch (err) {
            toast.error(err.message);
          }
        },
      });
    }

    tableContainer.innerHTML = '';
    tableContainer.appendChild(
      DataTable({
        columns: [
          { key: 'col', label: 'Categoría', render: (r) => escapeHtml(COLUMNS[r.col].title) },
          { key: 'name', label: 'Nombre', render: (r) => escapeHtml(r.name) },
          { key: 'sub', label: 'Detalle', render: (r) => (r.sub ? escapeHtml(r.sub) : '—') },
          {
            key: 'color',
            label: 'Color',
            render: (r) => `<span class="topology-admin__swatch" style="background:${r.color || COLUMNS[r.col].color}"></span>`,
          },
        ],
        rows: sorted,
        actions,
        emptyMessage: 'No hay cajas cargadas todavía',
      })
    );
  }

  function openNodeForm(existing) {
    const isEdit = Boolean(existing);
    const wrapper = document.createElement('div');
    wrapper.className = 'form';

    const colGroup = document.createElement('div');
    colGroup.className = 'form__group';
    const colLabel = document.createElement('label');
    colLabel.textContent = 'Categoría';
    colGroup.appendChild(colLabel);

    let colSelect = null;
    if (isEdit) {
      const fixed = document.createElement('input');
      fixed.value = COLUMNS[existing.col].title;
      fixed.disabled = true;
      colGroup.appendChild(fixed);
    } else {
      colSelect = document.createElement('select');
      colSelect.innerHTML = COLUMNS.map((c, i) => `<option value="${i}">${c.title}</option>`).join('');
      colGroup.appendChild(colSelect);
    }
    wrapper.appendChild(colGroup);

    const bodyContainer = document.createElement('div');
    wrapper.appendChild(bodyContainer);

    function renderFields(col) {
      bodyContainer.innerHTML = '';

      if (col === 0) {
        const existingNames = new Set(nodes.filter((n) => n.col === 0 && n.id !== existing?.id).map((n) => n.name));
        const options = CRIT_LEVELS.filter((l) => !existingNames.has(l.name));

        if (!options.length) {
          const p = document.createElement('p');
          p.className = 'alert alert--error';
          p.textContent = 'Ya existen los 4 niveles de criticidad.';
          bodyContainer.appendChild(p);
          return;
        }

        bodyContainer.appendChild(
          Form({
            fields: [
              {
                name: 'name',
                label: 'Nivel',
                type: 'select',
                value: existing?.name,
                options: options.map((l) => ({ value: l.name, label: l.name })),
              },
              { name: 'sub', label: 'Detalle (opcional)', value: existing?.sub },
            ],
            submitLabel: isEdit ? 'Guardar cambios' : 'Crear caja',
            onSubmit: async (values) => {
              const level = CRIT_LEVELS.find((l) => l.name === values.name);
              if (isEdit) {
                await topologyService.updateNode(existing.id, {
                  name: level.name,
                  sub: (values.sub || '').trim(),
                  color: level.color,
                });
                toast.success('Caja actualizada');
              } else {
                await topologyService.createNode({
                  columnIndex: 0,
                  name: level.name,
                  sub: (values.sub || '').trim(),
                  color: level.color,
                });
                toast.success('Caja creada');
              }
              modal.close();
              refresh();
            },
          })
        );
        return;
      }

      bodyContainer.appendChild(
        Form({
          fields: [
            { name: 'name', label: 'Nombre', value: existing?.name, required: true },
            { name: 'sub', label: 'Detalle (opcional)', value: existing?.sub },
            { name: 'color', label: 'Color (hex, opcional, ej. #2E74B5)', value: existing?.color },
          ],
          submitLabel: isEdit ? 'Guardar cambios' : 'Crear caja',
          onSubmit: async (values) => {
            const name = values.name.trim();
            if (!name) return;
            const sub = (values.sub || '').trim();
            const color = (values.color || '').trim();

            if (isEdit) {
              await topologyService.updateNode(existing.id, { name, sub, color });
              toast.success('Caja actualizada');
            } else {
              const payload = { columnIndex: col, name, sub };
              if (color) payload.color = color;
              await topologyService.createNode(payload);
              toast.success('Caja creada');
            }
            modal.close();
            refresh();
          },
        })
      );
    }

    const initialCol = isEdit ? existing.col : 0;
    renderFields(initialCol);
    if (colSelect) {
      colSelect.addEventListener('change', () => renderFields(Number(colSelect.value)));
    }

    const modal = openModal({ title: isEdit ? `Editar "${existing.name}"` : 'Nueva caja', content: wrapper });
  }

  await refresh();
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
