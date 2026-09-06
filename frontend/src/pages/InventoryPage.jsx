/**
 * pages/InventoryPage.jsx
 *
 * ABM de inventario de hardware físico: servidores, networking y
 * energía. Cada ítem registra marca, modelo, ubicación (vínculo
 * obligatorio a una oficina del catálogo de Oficinas) y si cuenta con
 * soporte de fábrica — de ser así, opcionalmente hasta qué fecha y qué
 * proveedor lo brinda (vínculo opcional a un proveedor, igual que en
 * licencias). Si se destilda "cuenta con soporte", el backend limpia
 * esos dos campos independientemente de lo que haya quedado cargado en
 * el formulario.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Form } from '../components/Form.jsx';
import { Modal } from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { inventoryService } from '../services/inventory.service.js';
import { providerService } from '../services/provider.service.js';
import { officeService } from '../services/office.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { escapeHtml } from '@/lib/escapeHtml.js';
import { formatDate } from '@/lib/formatDate.js';

const TYPE_OPTIONS = [
  { value: 'servidor', label: 'Servidor' },
  { value: 'networking', label: 'Networking' },
  { value: 'energia', label: 'Energía' },
];

const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]));

export function InventoryPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.INVENTORY_EDIT);
  const confirm = useConfirm();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formTarget, setFormTarget] = useState(undefined); // undefined = cerrado, null = alta, objeto = edición

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await inventoryService.list());
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
          title: 'Eliminar ítem de inventario',
          message: `¿Eliminar "${row.brand} ${row.model}"? Esta acción no se puede deshacer.`,
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return;
        try {
          await inventoryService.remove(row.id);
          toast.success('Ítem eliminado');
          refresh();
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Hardware</h1>
      <p className="topology-page__hint">
        Alta, baja y modificación de hardware físico (servidores y networking): marca, modelo, ubicación, IP de
        administración y soporte de fábrica.
      </p>

      <div className="my-4">{canEdit && <Button onClick={() => setFormTarget(null)}>+ Nuevo hardware</Button>}</div>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <DataTable
          columns={[
            { key: 'type', label: 'Tipo', render: (r) => TYPE_LABELS[r.type] ?? r.type },
            { key: 'brand', label: 'Marca' },
            { key: 'model', label: 'Modelo' },
            { key: 'officeName', label: 'Ubicación' },
            { key: 'managementIp', label: 'IP de administración', render: (r) => (r.managementIp ? escapeHtml(r.managementIp) : '—') },
            {
              key: 'includeInTopology',
              label: 'Topología de Red',
              render: (r) => (r.type === 'networking' ? (r.includeInTopology ? 'Sí' : 'No') : '—'),
            },
            { key: 'hasSupport', label: 'Soporte de fábrica', render: (r) => (r.hasSupport ? 'Sí' : 'No') },
            { key: 'supportUntil', label: 'Vigente hasta', render: (r) => (r.hasSupport ? formatDate(r.supportUntil) : '—') },
            {
              key: 'supportProviderName',
              label: 'Proveedor de soporte',
              render: (r) => (r.hasSupport && r.supportProviderName ? escapeHtml(r.supportProviderName) : '—'),
            },
          ]}
          rows={items}
          actions={actions}
          emptyMessage="No hay hardware cargado todavía"
        />
      )}

      {formTarget !== undefined && (
        <InventoryFormModal
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

function InventoryFormModal({ existing, onClose, onSaved }) {
  const isEdit = Boolean(existing);
  const [providers, setProviders] = useState(null);
  const [offices, setOffices] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [providerList, officeList] = await Promise.all([providerService.list(), officeService.list()]);
        if (officeList.length === 0) {
          setLoadError('Primero registrá al menos una oficina en "Oficinas" para poder cargar hardware');
          return;
        }
        setProviders(providerList);
        setOffices(officeList);
      } catch (err) {
        setLoadError('No se pudo cargar proveedores u oficinas: ' + err.message);
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

  if (loadError || providers === null || offices === null) return null;

  const providerOptions = [{ value: '', label: 'Sin proveedor' }, ...providers.map((p) => ({ value: p.id, label: p.name }))];
  const officeOptions = offices.map((o) => ({ value: o.id, label: o.name }));

  return (
    <Modal title={isEdit ? `Editar "${existing.brand} ${existing.model}"` : 'Nuevo hardware'} onClose={onClose}>
      <Form
        fields={[
          { name: 'type', label: 'Tipo', type: 'select', value: existing?.type ?? 'servidor', options: TYPE_OPTIONS, required: true },
          { name: 'brand', label: 'Marca', value: existing?.brand, required: true },
          { name: 'model', label: 'Modelo', value: existing?.model, required: true },
          { name: 'officeId', label: 'Ubicación (oficina)', type: 'select', value: existing?.officeId ?? officeOptions[0].value, options: officeOptions, required: true },
          { name: 'managementIp', label: 'IP de administración (opcional)', value: existing?.managementIp },
          {
            name: 'includeInTopology',
            label: 'Incluir en Topología de Red (solo equipos de networking)',
            type: 'checkbox',
            value: existing?.includeInTopology ?? false,
            enabledWhen: (values) => values.type === 'networking',
          },
          { name: 'hasSupport', label: 'Cuenta con soporte de fábrica', type: 'checkbox', value: existing?.hasSupport ?? false },
          {
            name: 'supportUntil',
            label: 'Vigente hasta (si cuenta con soporte)',
            type: 'date',
            value: existing?.supportUntil?.slice(0, 10) ?? '',
            enabledWhen: (values) => Boolean(values.hasSupport),
          },
          {
            name: 'supportProviderId',
            label: 'Proveedor de soporte (si cuenta con soporte)',
            type: 'select',
            value: existing?.supportProviderId ?? '',
            options: providerOptions,
            enabledWhen: (values) => Boolean(values.hasSupport),
          },
        ]}
        submitLabel={isEdit ? 'Guardar cambios' : 'Crear hardware'}
        onSubmit={async (values) => {
          const payload = {
            type: values.type,
            brand: values.brand.trim(),
            model: values.model.trim(),
            officeId: values.officeId,
            managementIp: (values.managementIp || '').trim(),
            includeInTopology: values.type === 'networking' ? Boolean(values.includeInTopology) : false,
            hasSupport: Boolean(values.hasSupport),
            supportUntil: values.hasSupport ? values.supportUntil || null : null,
            supportProviderId: values.hasSupport ? values.supportProviderId || null : null,
          };
          if (isEdit) {
            await inventoryService.update(existing.id, payload);
            toast.success('Hardware actualizado');
          } else {
            await inventoryService.create(payload);
            toast.success('Hardware creado');
          }
          onSaved();
        }}
      />
    </Modal>
  );
}
