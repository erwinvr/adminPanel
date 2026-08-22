import { auth } from '../auth/session.js';
import { Layout } from '../components/Layout.js';
import { DataTable } from '../components/DataTable.js';
import { Form } from '../components/Form.js';
import { openModal } from '../components/Modal.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { toast } from '../components/Toast.js';
import { roleService } from '../services/role.service.js';
import { permissionService } from '../services/permission.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';

export async function renderRolesPage() {
  const root = document.getElementById('app');
  root.innerHTML = '';

  const content = document.createElement('div');
  content.innerHTML = '<h1>Roles y permisos</h1>';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  if (auth.hasPermission(PERMISSIONS.ROLES_CREATE)) {
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn btn--primary';
    createBtn.textContent = '+ Nuevo rol';
    createBtn.addEventListener('click', () => openRoleForm());
    toolbar.appendChild(createBtn);
  }
  content.appendChild(toolbar);

  const tableContainer = document.createElement('div');
  content.appendChild(tableContainer);

  root.appendChild(Layout(content));

  async function refresh() {
    tableContainer.innerHTML = '<p>Cargando…</p>';
    try {
      const roles = await roleService.list();
      tableContainer.innerHTML = '';

      const actions = [];
      if (auth.hasPermission(PERMISSIONS.ROLES_UPDATE)) {
        actions.push({ label: 'Editar', onClick: (row) => openRoleForm(row) });
      }
      if (auth.hasPermission(PERMISSIONS.ROLES_DELETE)) {
        actions.push({
          label: 'Eliminar',
          variant: 'danger',
          onClick: async (row) => {
            if (row.is_system) {
              toast.error('No se puede eliminar un rol de sistema');
              return;
            }
            const ok = await confirmDialog({
              title: 'Eliminar rol',
              message: `¿Eliminar el rol "${row.name}"? Esta acción no se puede deshacer.`,
              confirmLabel: 'Eliminar',
              danger: true,
            });
            if (!ok) return;
            try {
              await roleService.remove(row.id);
              toast.success('Rol eliminado');
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
            { key: 'name', label: 'Nombre', render: (r) => (r.is_system ? `${r.name} 🔒` : r.name) },
            { key: 'description', label: 'Descripción' },
            { key: 'permissions', label: 'Permisos', render: (r) => `${r.permissions.length} asignados` },
          ],
          rows: roles,
          actions,
        })
      );
    } catch (err) {
      tableContainer.innerHTML = `<p class="alert alert--error">${err.message}</p>`;
    }
  }

  async function openRoleForm(existingRole) {
    const isEdit = Boolean(existingRole);
    let allPermissions = [];
    try {
      allPermissions = await permissionService.list();
    } catch (err) {
      toast.error('No se pudo cargar el catálogo de permisos: ' + err.message);
      return;
    }

    const currentPermissionIds = existingRole?.permissions?.map((p) => p.id) ?? [];

    const fields = [
      ...(isEdit ? [] : [{ name: 'name', label: 'Nombre del rol', required: true }]),
      { name: 'description', label: 'Descripción', value: existingRole?.description ?? '' },
      {
        name: 'permissionIds',
        label: 'Permisos',
        type: 'checkbox-group',
        value: currentPermissionIds,
        options: allPermissions.map((p) => ({ value: p.id, label: `${p.code} — ${p.description ?? ''}` })),
      },
    ];

    const form = Form({
      fields,
      submitLabel: isEdit ? 'Guardar cambios' : 'Crear rol',
      onSubmit: async (values) => {
        if (isEdit) {
          await roleService.update(existingRole.id, values);
          toast.success('Rol actualizado');
        } else {
          await roleService.create(values);
          toast.success('Rol creado');
        }
        modal.close();
        refresh();
      },
    });

    const modal = openModal({ title: isEdit ? `Editar rol: ${existingRole.name}` : 'Nuevo rol', content: form });
  }

  refresh();
}
