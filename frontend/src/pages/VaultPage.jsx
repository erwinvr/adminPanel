/**
 * pages/VaultPage.jsx
 *
 * Bóveda de contraseñas: ABM de credenciales de aplicaciones
 * (vinculadas a una caja "Aplicación" del mapa de topología) o de
 * dispositivos (vinculadas a un ítem de Inventarios). El listado NUNCA
 * trae el secreto — "Ver contraseña" pide el valor real bajo demanda
 * (queda auditado en el backend cada vez) y se muestra en un modal
 * aparte, nunca en la tabla.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Form } from '../components/Form.jsx';
import { Modal } from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { vaultService } from '../services/vault.service.js';
import { topologyService } from '../services/topology.service.js';
import { inventoryService } from '../services/inventory.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Input } from '@/components/ui/input.jsx';
import { escapeHtml } from '@/lib/escapeHtml.js';
import { Eye, Copy } from 'lucide-react';

const APPLICATION_COLUMN_INDEX = 1;

const TYPE_OPTIONS = [
  { value: 'application', label: 'Aplicación' },
  { value: 'device', label: 'Dispositivo' },
];

const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]));

function targetLabel(row) {
  if (row.type === 'application') return row.targetNodeName || '—';
  return row.targetHardwareBrand ? `${row.targetHardwareBrand} ${row.targetHardwareModel}` : '—';
}

export function VaultPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.VAULT_EDIT);
  const confirm = useConfirm();

  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formTarget, setFormTarget] = useState(undefined); // undefined = cerrado, null = alta, objeto = edición
  const [revealTarget, setRevealTarget] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCredentials(await vaultService.list());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const actions = [{ label: 'Ver contraseña', onClick: (row) => setRevealTarget(row) }];
  if (canEdit) {
    actions.push({ label: 'Editar', onClick: (row) => setFormTarget(row) });
    actions.push({
      label: 'Eliminar',
      variant: 'danger',
      onClick: async (row) => {
        const ok = await confirm({
          title: 'Eliminar credencial',
          message: `¿Eliminar "${row.name}"? Esta acción no se puede deshacer.`,
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return;
        try {
          await vaultService.remove(row.id);
          toast.success('Credencial eliminada');
          refresh();
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Bóveda de contraseñas</h1>
      <p className="topology-page__hint">
        Credenciales de aplicaciones y dispositivos, cifradas en reposo. Cada vez que se revela una contraseña queda
        registrado en Auditoría.
      </p>

      <div className="my-4">{canEdit && <Button onClick={() => setFormTarget(null)}>+ Nueva credencial</Button>}</div>

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
            { key: 'name', label: 'Nombre' },
            { key: 'username', label: 'Usuario', render: (r) => (r.username ? escapeHtml(r.username) : '—') },
            { key: 'target', label: 'Vinculado a', render: (r) => escapeHtml(targetLabel(r)) },
            { key: 'notes', label: 'Notas', render: (r) => (r.notes ? escapeHtml(r.notes) : '—') },
          ]}
          rows={credentials}
          actions={actions}
          emptyMessage="No hay credenciales cargadas todavía"
        />
      )}

      {formTarget !== undefined && (
        <CredentialFormModal
          existing={formTarget}
          onClose={() => setFormTarget(undefined)}
          onSaved={() => {
            setFormTarget(undefined);
            refresh();
          }}
        />
      )}

      {revealTarget && <RevealSecretModal credential={revealTarget} onClose={() => setRevealTarget(null)} />}
    </Layout>
  );
}

function RevealSecretModal({ credential, onClose }) {
  const [secret, setSecret] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await vaultService.reveal(credential.id);
        setSecret(result.secret);
      } catch (err) {
        setLoadError(err.message);
      }
    })();
  }, [credential.id]);

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success('Contraseña copiada al portapapeles');
    } catch {
      toast.error('No se pudo copiar — copiá el valor manualmente');
    }
  }

  return (
    <Modal title={`Contraseña de "${credential.name}"`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : secret === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="flex items-center gap-2">
            <Input readOnly value={secret} className="font-mono" onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" size="icon" title="Copiar" onClick={copySecret}>
              <Copy className="size-4" />
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Este acceso quedó registrado en Auditoría.</p>
      </div>
    </Modal>
  );
}

function CredentialFormModal({ existing, onClose, onSaved }) {
  const isEdit = Boolean(existing);
  const [applicationNodes, setApplicationNodes] = useState(null);
  const [hardwareItems, setHardwareItems] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [graph, hardware] = await Promise.all([topologyService.getGraph(), inventoryService.list()]);
        setApplicationNodes(graph.nodes.filter((n) => n.col === APPLICATION_COLUMN_INDEX));
        setHardwareItems(hardware);
      } catch (err) {
        setLoadError('No se pudo cargar aplicaciones o dispositivos: ' + err.message);
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

  if (loadError || applicationNodes === null || hardwareItems === null) return null;

  const nodeOptions = applicationNodes.map((n) => ({ value: n.id, label: n.name }));
  const hardwareOptions = hardwareItems.map((h) => ({ value: h.id, label: `${h.brand} ${h.model}` }));

  return (
    <Modal title={isEdit ? `Editar "${existing.name}"` : 'Nueva credencial'} onClose={onClose}>
      <Form
        fields={[
          {
            name: 'type',
            label: 'Tipo',
            type: 'select',
            value: existing?.type ?? 'application',
            options: TYPE_OPTIONS,
            required: true,
            disabled: isEdit,
          },
          { name: 'name', label: 'Nombre', value: existing?.name, required: true },
          { name: 'username', label: 'Usuario (opcional)', value: existing?.username },
          {
            name: 'secret',
            label: isEdit ? 'Nueva contraseña (dejar vacío para no cambiarla)' : 'Contraseña',
            type: 'password',
            required: !isEdit,
          },
          {
            name: 'targetNodeId',
            label: 'Aplicación',
            type: 'select',
            value: existing?.targetNodeId ?? nodeOptions[0]?.value ?? '',
            options: nodeOptions,
            enabledWhen: (values) => values.type === 'application',
          },
          {
            name: 'targetHardwareId',
            label: 'Dispositivo',
            type: 'select',
            value: existing?.targetHardwareId ?? hardwareOptions[0]?.value ?? '',
            options: hardwareOptions,
            enabledWhen: (values) => values.type === 'device',
          },
          { name: 'notes', label: 'Notas (opcional)', value: existing?.notes },
        ]}
        submitLabel={isEdit ? 'Guardar cambios' : 'Crear credencial'}
        onSubmit={async (values) => {
          if (values.type === 'application' && !values.targetNodeId) {
            throw new Error('Primero registrá al menos una caja de categoría "Aplicación" en Parámetros → Aplicaciones');
          }
          if (values.type === 'device' && !values.targetHardwareId) {
            throw new Error('Primero registrá al menos un ítem en Parámetros → Hardware');
          }

          const payload = {
            name: values.name.trim(),
            username: (values.username || '').trim(),
            notes: (values.notes || '').trim(),
            ...(values.type === 'application' ? { targetNodeId: values.targetNodeId } : { targetHardwareId: values.targetHardwareId }),
          };
          if (values.secret) payload.secret = values.secret;

          if (isEdit) {
            await vaultService.update(existing.id, payload);
            toast.success('Credencial actualizada');
          } else {
            await vaultService.create({ ...payload, type: values.type });
            toast.success('Credencial creada');
          }
          onSaved();
        }}
      />
    </Modal>
  );
}
