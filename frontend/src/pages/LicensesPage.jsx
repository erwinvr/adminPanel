/**
 * pages/LicensesPage.jsx
 *
 * ABM de licencias de software. Una licencia puede vincularse
 * opcionalmente a UN proveedor (relación simple, un select — a
 * diferencia de proveedores↔aplicaciones que es muchos-a-muchos). No
 * se vincula a aplicaciones ni tiene dashboard propio: la única vista
 * es este listado.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Form } from '../components/Form.jsx';
import { Modal } from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { licenseService } from '../services/license.service.js';
import { providerService } from '../services/provider.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { formatDate } from '@/lib/formatDate.js';

export function LicensesPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.LICENSES_EDIT);
  const confirm = useConfirm();

  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formTarget, setFormTarget] = useState(undefined); // undefined = cerrado, null = alta, objeto = edición

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLicenses(await licenseService.list());
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
  if (canEdit) {
    actions.push({ label: 'Editar', onClick: (row) => setFormTarget(row) });
    actions.push({
      label: 'Eliminar',
      variant: 'danger',
      onClick: async (row) => {
        const ok = await confirm({
          title: 'Eliminar licencia',
          message: `¿Eliminar "${row.name}"? Esta acción no se puede deshacer.`,
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return;
        try {
          await licenseService.remove(row.id);
          toast.success('Licencia eliminada');
          refresh();
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Licencias</h1>
      <p className="topology-page__hint">
        Alta, baja y modificación de licencias de software. Cada licencia puede vincularse opcionalmente a un proveedor.
      </p>

      <div className="my-4">
        {canEdit && <Button onClick={() => setFormTarget(null)}>+ Nueva licencia</Button>}
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
            { key: 'name', label: 'Nombre' },
            { key: 'providerName', label: 'Proveedor', render: (r) => r.providerName || '—' },
            { key: 'licenseKey', label: 'Clave', render: (r) => r.licenseKey || '—' },
            { key: 'seats', label: 'Asientos', render: (r) => (r.seats ?? '—').toString() },
            { key: 'expiresAt', label: 'Vence', render: (r) => formatDate(r.expiresAt) },
            { key: 'notes', label: 'Notas', render: (r) => r.notes || '—' },
          ]}
          rows={licenses}
          actions={actions}
          emptyMessage="No hay licencias cargadas todavía"
        />
      )}

      {formTarget !== undefined && (
        <LicenseFormModal
          existing={formTarget}
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

function LicenseFormModal({ existing, onClose, onSaved }) {
  const isEdit = Boolean(existing);
  const [providers, setProviders] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setProviders(await providerService.list());
      } catch (err) {
        setLoadError('No se pudo cargar el listado de proveedores: ' + err.message);
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

  if (loadError || providers === null) return null;

  const providerOptions = [{ value: '', label: 'Sin proveedor' }, ...providers.map((p) => ({ value: p.id, label: p.name }))];

  return (
    <Modal title={isEdit ? `Editar "${existing.name}"` : 'Nueva licencia'} onClose={onClose}>
      <Form
        fields={[
          { name: 'name', label: 'Nombre', value: existing?.name, required: true },
          { name: 'providerId', label: 'Proveedor (opcional)', type: 'select', value: existing?.providerId ?? '', options: providerOptions },
          { name: 'licenseKey', label: 'Clave de licencia (opcional)', value: existing?.licenseKey },
          { name: 'seats', label: 'Asientos (opcional)', type: 'number', value: existing?.seats ?? '' },
          { name: 'expiresAt', label: 'Fecha de vencimiento (opcional)', type: 'date', value: existing?.expiresAt?.slice(0, 10) ?? '' },
          { name: 'notes', label: 'Notas (opcional)', value: existing?.notes },
        ]}
        submitLabel={isEdit ? 'Guardar cambios' : 'Crear licencia'}
        onSubmit={async (values) => {
          const payload = {
            name: values.name.trim(),
            providerId: values.providerId || null,
            licenseKey: (values.licenseKey || '').trim(),
            seats: values.seats ? Number(values.seats) : null,
            expiresAt: values.expiresAt || null,
            notes: (values.notes || '').trim(),
          };
          if (isEdit) {
            await licenseService.update(existing.id, payload);
            toast.success('Licencia actualizada');
          } else {
            await licenseService.create(payload);
            toast.success('Licencia creada');
          }
          onSaved();
        }}
      />
    </Modal>
  );
}
