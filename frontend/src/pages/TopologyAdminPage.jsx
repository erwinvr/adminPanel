/**
 * pages/TopologyAdminPage.jsx
 *
 * ABM (alta / baja / modificación) de las cajas que aparecen en el
 * mapa de topología (dashboard de solo lectura + conexiones en
 * TopologyPage.jsx). Acá se administran las cajas de cada categoría
 * fija (Criticidad, Aplicación, Base de Datos, Servidor/Instancia,
 * Datacenter/Nube) — el mapa ya no tiene controles de alta/baja de
 * cajas para no saturar la vista.
 *
 * Requiere topology.edit (misma regla que el resto de la edición del
 * mapa) — el router y el nav ya bloquean el acceso sin ese permiso;
 * acá además se ocultan los botones de alta/editar/eliminar por si
 * alguien llega con topology.view solamente.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Form } from '../components/Form.jsx';
import { Modal } from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { topologyService } from '../services/topology.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { COLUMNS, CRIT_LEVELS } from '../constants/topology.js';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { escapeHtml } from '@/lib/escapeHtml.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';

// Radix <Select.Item> no admite value="" — se usa este valor de reemplazo
// para representar "todas las categorías" en el filtro.
const ALL_CATEGORIES = '__all__';

export function TopologyAdminPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.TOPOLOGY_EDIT);
  const confirm = useConfirm();

  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [formTarget, setFormTarget] = useState(undefined); // undefined = closed, null = create, object = edit

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const graph = await topologyService.getGraph();
      setNodes(graph.nodes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = categoryFilter === '' ? nodes : nodes.filter((n) => String(n.col) === categoryFilter);
  const sorted = [...filtered].sort((a, b) => a.col - b.col || a.name.localeCompare(b.name));

  const actions = [];
  if (canEdit) {
    actions.push({ label: 'Editar', onClick: (row) => setFormTarget(row) });
    actions.push({
      label: 'Eliminar',
      variant: 'danger',
      onClick: async (row) => {
        const ok = await confirm({
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

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Aplicaciones</h1>
      <p className="topology-page__hint">
        Alta, baja y modificación de las cajas de cada categoría (Criticidad, Aplicación, Base de Datos, Servidor/Instancia,
        Datacenter/Nube). Las conexiones entre cajas se gestionan desde el mapa de topología.
      </p>

      <div className="my-4 flex items-center justify-between gap-3">
        <Select value={categoryFilter === '' ? ALL_CATEGORIES : categoryFilter} onValueChange={(v) => setCategoryFilter(v === ALL_CATEGORIES ? '' : v)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>Todas las categorías</SelectItem>
            {COLUMNS.map((c, i) => (
              <SelectItem key={i} value={String(i)}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canEdit && <Button onClick={() => setFormTarget(null)}>+ Nueva caja</Button>}
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
            { key: 'col', label: 'Categoría', render: (r) => COLUMNS[r.col].title },
            { key: 'name', label: 'Nombre' },
            { key: 'sub', label: 'Detalle', render: (r) => (r.sub ? escapeHtml(r.sub) : '—') },
            {
              key: 'color',
              label: 'Color',
              render: (r) => `<span class="topology-admin__swatch" style="background:${r.color || COLUMNS[r.col].color}"></span>`,
            },
          ]}
          rows={sorted}
          actions={actions}
          emptyMessage="No hay cajas cargadas todavía"
        />
      )}

      {formTarget !== undefined && (
        <NodeFormModal
          existing={formTarget}
          nodes={nodes}
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

function NodeFormModal({ existing, nodes, onClose, onSaved }) {
  const isEdit = Boolean(existing);
  const [col, setCol] = useState(isEdit ? existing.col : 0);

  const existingCritNames = new Set(nodes.filter((n) => n.col === 0 && n.id !== existing?.id).map((n) => n.name));
  const critOptions = CRIT_LEVELS.filter((l) => !existingCritNames.has(l.name));

  return (
    <Modal title={isEdit ? `Editar "${existing.name}"` : 'Nueva caja'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Categoría</Label>
          {isEdit ? (
            <Input value={COLUMNS[existing.col].title} disabled readOnly />
          ) : (
            <Select value={String(col)} onValueChange={(v) => setCol(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLUMNS.map((c, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {col === 0 ? (
          critOptions.length === 0 ? (
            <Alert variant="destructive">
              <AlertDescription>Ya existen los 4 niveles de criticidad.</AlertDescription>
            </Alert>
          ) : (
            <Form
              key={`crit-${col}`}
              fields={[
                {
                  name: 'name',
                  label: 'Nivel',
                  type: 'select',
                  value: existing?.name,
                  options: critOptions.map((l) => ({ value: l.name, label: l.name })),
                },
                { name: 'sub', label: 'Detalle (opcional)', value: existing?.sub },
              ]}
              submitLabel={isEdit ? 'Guardar cambios' : 'Crear caja'}
              onSubmit={async (values) => {
                const level = CRIT_LEVELS.find((l) => l.name === values.name);
                if (isEdit) {
                  await topologyService.updateNode(existing.id, { name: level.name, sub: (values.sub || '').trim(), color: level.color });
                  toast.success('Caja actualizada');
                } else {
                  await topologyService.createNode({ columnIndex: 0, name: level.name, sub: (values.sub || '').trim(), color: level.color });
                  toast.success('Caja creada');
                }
                onSaved();
              }}
            />
          )
        ) : (
          <Form
            key={`plain-${col}`}
            fields={[
              { name: 'name', label: 'Nombre', value: existing?.name, required: true },
              { name: 'sub', label: 'Detalle (opcional)', value: existing?.sub },
              { name: 'color', label: 'Color (hex, opcional, ej. #2E74B5)', value: existing?.color },
            ]}
            submitLabel={isEdit ? 'Guardar cambios' : 'Crear caja'}
            onSubmit={async (values) => {
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
              onSaved();
            }}
          />
        )}
      </div>
    </Modal>
  );
}
