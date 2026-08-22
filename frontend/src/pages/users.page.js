import { auth } from '../auth/session.js';
import { Layout } from '../components/Layout.js';
import { DataTable } from '../components/DataTable.js';
import { Pagination } from '../components/Pagination.js';
import { Form } from '../components/Form.js';
import { openModal } from '../components/Modal.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { toast } from '../components/Toast.js';
import { userService } from '../services/user.service.js';
import { roleService } from '../services/role.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';

let state = { page: 1, pageSize: 10, search: '' };

export async function renderUsersPage() {
  const root = document.getElementById('app');
  root.innerHTML = '';

  const content = document.createElement('div');
  content.innerHTML = '<h1>Usuarios</h1>';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Buscar por nombre, usuario o email…';
  searchInput.value = state.search;
  searchInput.addEventListener('input', debounce(() => {
    state.search = searchInput.value;
    state.page = 1;
    refresh();
  }, 350));
  toolbar.appendChild(searchInput);

  if (auth.hasPermission(PERMISSIONS.USERS_CREATE)) {
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn btn--primary';
    createBtn.textContent = '+ Nuevo usuario';
    createBtn.addEventListener('click', () => openUserForm());
    toolbar.appendChild(createBtn);
  }

  content.appendChild(toolbar);

  const tableContainer = document.createElement('div');
  content.appendChild(tableContainer);

  root.appendChild(Layout(content));

  async function refresh() {
    tableContainer.innerHTML = '<p>Cargando…</p>';
    try {
      const { data: users, meta } = await userService.list(state);
      tableContainer.innerHTML = '';

      const actions = [];
      if (auth.hasPermission(PERMISSIONS.USERS_UPDATE)) {
        actions.push({ label: 'Editar', onClick: (row) => openUserForm(row) });
      }
      if (auth.hasPermission(PERMISSIONS.USERS_DELETE)) {
        actions.push({
          label: 'Desactivar',
          variant: 'danger',
          onClick: async (row) => {
            const ok = await confirmDialog({
              title: 'Desactivar usuario',
              message: `¿Desactivar a ${row.username}? Podrá reactivarse luego editando su estado.`,
              confirmLabel: 'Desactivar',
              danger: true,
            });
            if (!ok) return;
            try {
              await userService.deactivate(row.id);
              toast.success('Usuario desactivado');
              refresh();
            } catch (err) {
              toast.error(err.message);
            }
          },
        });
      }

      tableContainer.appendChild(
        DataTable({
          columns: [
            { key: 'username', label: 'Usuario' },
            { key: 'full_name', label: 'Nombre', render: (r) => `${r.first_name} ${r.last_name}` },
            { key: 'email', label: 'Email' },
            { key: 'status', label: 'Estado', render: (r) => statusBadge(r.status) },
          ],
          rows: users,
          actions,
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

  async function openUserForm(existingUser) {
    const isEdit = Boolean(existingUser);
    let roles = [];
    let currentRoleIds = [];
    try {
      roles = await roleService.list();
      if (isEdit) {
        const detail = await userService.get(existingUser.id);
        currentRoleIds = detail.roleIds ?? [];
      }
    } catch (err) {
      toast.error('No se pudo cargar el formulario: ' + err.message);
      return;
    }

    const fields = isEdit
      ? [
          { name: 'firstName', label: 'Nombre', value: existingUser.first_name, required: true },
          { name: 'lastName', label: 'Apellido', value: existingUser.last_name, required: true },
          { name: 'email', label: 'Email', type: 'email', value: existingUser.email, required: true },
          {
            name: 'status',
            label: 'Estado',
            type: 'select',
            value: existingUser.status,
            options: [
              { value: 'active', label: 'Activo' },
              { value: 'inactive', label: 'Inactivo' },
            ],
          },
          {
            name: 'roleIds',
            label: 'Roles',
            type: 'checkbox-group',
            value: currentRoleIds,
            options: roles.map((r) => ({ value: r.id, label: r.name })),
          },
        ]
      : [
          { name: 'firstName', label: 'Nombre', required: true },
          { name: 'lastName', label: 'Apellido', required: true },
          { name: 'username', label: 'Usuario', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'initialPassword', label: 'Contraseña inicial', type: 'password', required: true },
          {
            name: 'roleIds',
            label: 'Roles',
            type: 'checkbox-group',
            options: roles.map((r) => ({ value: r.id, label: r.name })),
          },
        ];

    const form = Form({
      fields,
      submitLabel: isEdit ? 'Guardar cambios' : 'Crear usuario',
      onSubmit: async (values) => {
        if (isEdit) {
          await userService.update(existingUser.id, values);
          toast.success('Usuario actualizado');
        } else {
          await userService.create(values);
          toast.success('Usuario creado');
        }
        modal.close();
        refresh();
      },
    });

    const modal = openModal({ title: isEdit ? 'Editar usuario' : 'Nuevo usuario', content: form });
  }

  refresh();
}

function statusBadge(status) {
  const labels = { active: 'Activo', inactive: 'Inactivo', locked: 'Bloqueado' };
  return `<span class="badge badge--${status}">${labels[status] ?? status}</span>`;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
