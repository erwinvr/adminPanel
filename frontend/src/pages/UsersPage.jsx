import { useCallback, useEffect, useRef, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { Form } from '../components/Form.jsx';
import { Modal } from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { userService } from '../services/user.service.js';
import { roleService } from '../services/role.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';

function statusBadge(status) {
  const map = {
    active: { label: 'Activo', variant: 'success' },
    inactive: { label: 'Inactivo', variant: 'secondary' },
    locked: { label: 'Bloqueado', variant: 'destructive' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'secondary' };
  return badgeHtml(label, variant);
}

export function UsersPage() {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();

  const [state, setState] = useState({ page: 1, pageSize: 10, search: '' });
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formTarget, setFormTarget] = useState(undefined); // undefined = closed, null = create, object = edit
  const debounceRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, meta: m } = await userService.list(state);
      setUsers(data);
      setMeta(m);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [state]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function onSearchChange(value) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setState((s) => ({ ...s, search: value, page: 1 }));
    }, 350);
  }

  const actions = [];
  if (hasPermission(PERMISSIONS.USERS_UPDATE)) {
    actions.push({ label: 'Editar', onClick: (row) => setFormTarget(row) });
  }
  if (hasPermission(PERMISSIONS.USERS_DELETE)) {
    actions.push({
      label: 'Desactivar',
      variant: 'danger',
      onClick: async (row) => {
        const ok = await confirm({
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

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Usuarios</h1>
      <div className="my-4 flex items-center justify-between gap-3">
        <Input
          type="search"
          placeholder="Buscar por nombre, usuario o email…"
          defaultValue={state.search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-xs"
        />
        {hasPermission(PERMISSIONS.USERS_CREATE) && <Button onClick={() => setFormTarget(null)}>+ Nuevo usuario</Button>}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'username', label: 'Usuario' },
              { key: 'full_name', label: 'Nombre', render: (r) => `${r.first_name} ${r.last_name}` },
              { key: 'email', label: 'Email' },
              { key: 'status', label: 'Estado', render: (r) => statusBadge(r.status) },
            ]}
            rows={users}
            actions={actions}
          />
          {meta && (
            <Pagination
              page={meta.pagination.page}
              totalPages={meta.pagination.totalPages}
              onChange={(page) => setState((s) => ({ ...s, page }))}
            />
          )}
        </>
      )}

      {formTarget !== undefined && (
        <UserFormModal
          existingUser={formTarget}
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

function UserFormModal({ existingUser, onClose, onSaved }) {
  const isEdit = Boolean(existingUser);
  const [roles, setRoles] = useState([]);
  const [currentRoleIds, setCurrentRoleIds] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const roleList = await roleService.list();
        setRoles(roleList);
        if (isEdit) {
          const detail = await userService.get(existingUser.id);
          setCurrentRoleIds(detail.roleIds ?? []);
        }
        setReady(true);
      } catch (err) {
        setLoadError('No se pudo cargar el formulario: ' + err.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loadError) {
      toast.error(loadError);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  if (loadError || !ready) return null;

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
        { name: 'roleIds', label: 'Roles', type: 'checkbox-group', options: roles.map((r) => ({ value: r.id, label: r.name })) },
      ];

  return (
    <Modal title={isEdit ? 'Editar usuario' : 'Nuevo usuario'} onClose={onClose}>
      <Form
        fields={fields}
        submitLabel={isEdit ? 'Guardar cambios' : 'Crear usuario'}
        onSubmit={async (values) => {
          if (isEdit) {
            await userService.update(existingUser.id, values);
            toast.success('Usuario actualizado');
          } else {
            await userService.create(values);
            toast.success('Usuario creado');
          }
          onSaved();
        }}
      />
    </Modal>
  );
}
