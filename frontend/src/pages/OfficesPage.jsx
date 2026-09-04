/**
 * pages/OfficesPage.jsx
 *
 * ABM de oficinas: catálogo cerrado de ubicaciones físicas que usa el
 * inventario de hardware para su campo "ubicación" (en vez de texto
 * libre repetido en cada ítem). No se puede eliminar una oficina con
 * hardware asignado — el backend lo rechaza con un mensaje claro.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Form } from '../components/Form.jsx';
import { Modal } from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { officeService } from '../services/office.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { escapeHtml } from '@/lib/escapeHtml.js';

export function OfficesPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.OFFICES_EDIT);
  const confirm = useConfirm();

  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formTarget, setFormTarget] = useState(undefined); // undefined = cerrado, null = alta, objeto = edición

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOffices(await officeService.list());
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
          title: 'Eliminar oficina',
          message: `¿Eliminar "${row.name}"? Esta acción no se puede deshacer.`,
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return;
        try {
          await officeService.remove(row.id);
          toast.success('Oficina eliminada');
          refresh();
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Oficinas</h1>
      <p className="topology-page__hint">
        Alta, baja y modificación de oficinas — se usan como ubicación de los ítems en la sección Hardware.
      </p>

      <div className="my-4">{canEdit && <Button onClick={() => setFormTarget(null)}>+ Nueva oficina</Button>}</div>

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
            { key: 'address', label: 'Dirección', render: (r) => (r.address ? escapeHtml(r.address) : '—') },
          ]}
          rows={offices}
          actions={actions}
          emptyMessage="No hay oficinas cargadas todavía"
        />
      )}

      {formTarget !== undefined && (
        <OfficeFormModal
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

function OfficeFormModal({ existing, onClose, onSaved }) {
  const isEdit = Boolean(existing);

  return (
    <Modal title={isEdit ? `Editar "${existing.name}"` : 'Nueva oficina'} onClose={onClose}>
      <Form
        fields={[
          { name: 'name', label: 'Nombre', value: existing?.name, required: true },
          { name: 'address', label: 'Dirección (opcional)', value: existing?.address },
        ]}
        submitLabel={isEdit ? 'Guardar cambios' : 'Crear oficina'}
        onSubmit={async (values) => {
          const payload = { name: values.name.trim(), address: (values.address || '').trim() };
          if (isEdit) {
            await officeService.update(existing.id, payload);
            toast.success('Oficina actualizada');
          } else {
            await officeService.create(payload);
            toast.success('Oficina creada');
          }
          onSaved();
        }}
      />
    </Modal>
  );
}
