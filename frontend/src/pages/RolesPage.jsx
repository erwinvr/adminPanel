import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Form } from '../components/Form.jsx';
import { Modal } from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { roleService } from '../services/role.service.js';
import { permissionService } from '../services/permission.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

export function RolesPage() {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formTarget, setFormTarget] = useState(undefined);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRoles(await roleService.list());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const actions = [];
  if (hasPermission(PERMISSIONS.ROLES_UPDATE)) {
    actions.push({ label: 'Editar', onClick: (row) => setFormTarget(row) });
  }
  if (hasPermission(PERMISSIONS.ROLES_DELETE)) {
    actions.push({
      label: 'Eliminar',
      variant: 'danger',
      onClick: async (row) => {
        if (row.is_system) {
          toast.error('No se puede eliminar un rol de sistema');
          return;
        }
        const ok = await confirm({
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

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Roles y permisos</h1>
      <div className="my-4">
        {hasPermission(PERMISSIONS.ROLES_CREATE) && <Button onClick={() => setFormTarget(null)}>+ Nuevo rol</Button>}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <DataTable
          columns={[
            { key: 'name', label: 'Nombre', render: (r) => (r.is_system ? `${r.name} 🔒` : r.name) },
            { key: 'description', label: 'Descripción' },
            { key: 'permissions', label: 'Permisos', render: (r) => `${r.permissions.length} asignados` },
          ]}
          rows={roles}
          actions={actions}
        />
      )}

      {formTarget !== undefined && (
        <RoleFormModal
          existingRole={formTarget}
          onClose={() => setFormTarget(undefined)}
          onSaved={() => {
            setFormTarget(undefined);
            refresh();
          }}
        />
      )}
    </Layout>
  );
}

function RoleFormModal({ existingRole, onClose, onSaved }) {
  const isEdit = Boolean(existingRole);
  const [allPermissions, setAllPermissions] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setAllPermissions(await permissionService.list());
        setReady(true);
      } catch (err) {
        setLoadError('No se pudo cargar el catálogo de permisos: ' + err.message);
      }
    })();
  }, []);

  useEffect(() => {
    if (loadError) {
      toast.error(loadError);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  if (loadError || !ready) return null;

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

  return (
    <Modal title={isEdit ? `Editar rol: ${existingRole.name}` : 'Nuevo rol'} onClose={onClose}>
      <Form
        fields={fields}
        submitLabel={isEdit ? 'Guardar cambios' : 'Crear rol'}
        onSubmit={async (values) => {
          if (isEdit) {
            await roleService.update(existingRole.id, values);
            toast.success('Rol actualizado');
          } else {
            await roleService.create(values);
            toast.success('Rol creado');
          }
          onSaved();
        }}
      />
    </Modal>
  );
}
