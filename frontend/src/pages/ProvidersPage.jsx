/**
 * pages/ProvidersPage.jsx
 *
 * ABM (alta / baja / modificación) de proveedores, y vínculo de cada
 * proveedor con los recursos del mapa de topología a los que abastece:
 * Aplicación, Base de Datos, Servidor/Instancia o Datacenter/Nube (no
 * Criticidad — no es un recurso real, ver constants/topology.js). La
 * visibilidad de esa relación en modo solo-lectura vive en
 * ProvidersDashboardPage.jsx.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Form } from '../components/Form.jsx';
import { Modal } from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { providerService } from '../services/provider.service.js';
import { topologyService } from '../services/topology.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { COLUMNS } from '../constants/topology.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

const CRITICALITY_COLUMN_INDEX = 0;

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

export function ProvidersPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.PROVIDERS_EDIT);
  const confirm = useConfirm();

  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formTarget, setFormTarget] = useState(undefined); // undefined = cerrado, null = alta, objeto = edición
  const [linkTarget, setLinkTarget] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProviders(await providerService.list());
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
    actions.push({ label: 'Vincular recursos', onClick: (row) => setLinkTarget(row) });
    actions.push({
      label: 'Eliminar',
      variant: 'danger',
      onClick: async (row) => {
        const ok = await confirm({
          title: 'Eliminar proveedor',
          message: `¿Eliminar "${row.name}"? También se eliminarán sus vínculos con recursos.`,
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return;
        try {
          await providerService.remove(row.id);
          toast.success('Proveedor eliminado');
          refresh();
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Proveedores</h1>
      <p className="topology-page__hint">
        Alta, baja y modificación de proveedores, y vínculo con los recursos del mapa de topología (aplicaciones, bases de
        datos, servidores/instancias y datacenter/nube). La vista de solo lectura de esta relación está en el dashboard
        "Proveedores y aplicaciones".
      </p>

      <div className="my-4">
        {canEdit && <Button onClick={() => setFormTarget(null)}>+ Nuevo proveedor</Button>}
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
            { key: 'contactEmail', label: 'Email' },
            { key: 'contactPhone', label: 'Teléfono' },
            {
              key: 'resources',
              label: 'Recursos vinculados',
              render: (r) => (r.resources.length ? r.resources.map((res) => escapeHtml(res.name)).join(', ') : '—'),
            },
          ]}
          rows={providers}
          actions={actions}
          emptyMessage="No hay proveedores cargados todavía"
        />
      )}

      {formTarget !== undefined && (
        <ProviderFormModal
          existing={formTarget}
          onClose={() => setFormTarget(undefined)}
          onSaved={() => {
            setFormTarget(undefined);
            refresh();
          }}
        />
      )}

      {linkTarget && (
        <LinkResourcesModal
          provider={linkTarget}
          onClose={() => setLinkTarget(null)}
          onSaved={() => {
            setLinkTarget(null);
            refresh();
          }}
        />
      )}
    </Layout>
  );
}

function ProviderFormModal({ existing, onClose, onSaved }) {
  const isEdit = Boolean(existing);

  return (
    <Modal title={isEdit ? `Editar "${existing.name}"` : 'Nuevo proveedor'} onClose={onClose}>
      <Form
        fields={[
          { name: 'name', label: 'Nombre', value: existing?.name, required: true },
          { name: 'contactEmail', label: 'Email de contacto (opcional)', type: 'email', value: existing?.contactEmail },
          { name: 'contactPhone', label: 'Teléfono de contacto (opcional)', value: existing?.contactPhone },
          { name: 'notes', label: 'Notas (opcional)', value: existing?.notes },
        ]}
        submitLabel={isEdit ? 'Guardar cambios' : 'Crear proveedor'}
        onSubmit={async (values) => {
          if (isEdit) {
            await providerService.update(existing.id, values);
            toast.success('Proveedor actualizado');
          } else {
            await providerService.create(values);
            toast.success('Proveedor creado');
          }
          onSaved();
        }}
      />
    </Modal>
  );
}

function LinkResourcesModal({ provider, onClose, onSaved }) {
  const [nodes, setNodes] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const graph = await topologyService.getGraph();
        setNodes(graph.nodes.filter((n) => n.col !== CRITICALITY_COLUMN_INDEX));
      } catch (err) {
        setLoadError('No se pudieron cargar los recursos: ' + err.message);
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

  if (loadError || nodes === null) return null;

  if (!nodes.length) {
    return (
      <Modal title={`Vincular recursos a "${provider.name}"`} onClose={onClose}>
        <Alert variant="warning">
          <AlertDescription>
            Todavía no hay ninguna caja de aplicación, base de datos, servidor/instancia o datacenter/nube cargada en el
            mapa de topología.
          </AlertDescription>
        </Alert>
      </Modal>
    );
  }

  const currentIds = provider.resources.map((r) => r.id);
  const groups = COLUMNS.map((c, ci) => ({ ci, title: c.title, nodes: nodes.filter((n) => n.col === ci) })).filter(
    (g) => g.nodes.length
  );

  return (
    <Modal title={`Vincular recursos a "${provider.name}"`} onClose={onClose}>
      <Form
        fields={groups.map((g) => ({
          name: `col_${g.ci}`,
          label: g.title,
          type: 'checkbox-group',
          options: g.nodes.map((n) => ({ value: n.id, label: n.name })),
          value: g.nodes.filter((n) => currentIds.includes(n.id)).map((n) => n.id),
        }))}
        submitLabel="Guardar vínculos"
        onSubmit={async (values) => {
          const nodeIds = Object.values(values).flat();
          await providerService.setResources(provider.id, nodeIds);
          toast.success('Vínculos actualizados');
          onSaved();
        }}
      />
    </Modal>
  );
}
