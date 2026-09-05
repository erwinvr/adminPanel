/**
 * pages/NetBackupCompliancePage.jsx
 *
 * "Backup Networking" → Compliance: reglas de texto/regex evaluadas
 * automáticamente contra la config de cada dispositivo tras cada
 * backup (ver backend/src/services/compliance.service.js) — muestra
 * SOLO el estado actual, no un historial de cada corrida. Dos vistas
 * en una sola página (Resumen / Reglas) en vez de dos ítems de menú,
 * para no seguir alargando la barra lateral.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Form } from '../components/Form.jsx';
import { Modal } from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { complianceService } from '../services/compliance.service.js';
import { NETBACKUP_DRIVER_OPTIONS, netbackupDriverLabel } from '../constants/netbackupDrivers.js';
import {
  COMPLIANCE_MODE_OPTIONS,
  COMPLIANCE_MATCH_TYPE_OPTIONS,
  COMPLIANCE_SEVERITY_OPTIONS,
  complianceSeverityLabel,
  complianceSeverityBadgeVariant,
  complianceMatchTypeLabel,
} from '../constants/complianceOptions.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { escapeHtml } from '@/lib/escapeHtml.js';
import { badgeHtml } from '@/lib/badgeHtml.js';

const DRIVER_FILTER_OPTIONS = [{ value: '', label: 'Todos los drivers' }, ...NETBACKUP_DRIVER_OPTIONS];

function passedBadge(passed) {
  return badgeHtml(passed ? 'Cumple' : 'Incumple', passed ? 'success' : 'destructive');
}

function activeBadge(active) {
  return badgeHtml(active ? 'Activa' : 'Inactiva', active ? 'success' : 'muted');
}

function severityBadge(severity) {
  return badgeHtml(complianceSeverityLabel(severity), complianceSeverityBadgeVariant(severity));
}

export function NetBackupCompliancePage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.NETBACKUP_EDIT);
  const confirm = useConfirm();

  const [view, setView] = useState('summary'); // 'summary' | 'rules'

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Compliance</h1>
      <p className="topology-page__hint">
        Reglas evaluadas automáticamente contra la config de cada dispositivo tras cada backup — muestra el estado
        ACTUAL, no un historial de cada corrida.
      </p>

      <div className="my-4 flex gap-2">
        <Button variant={view === 'summary' ? 'default' : 'outline'} onClick={() => setView('summary')}>
          Resumen
        </Button>
        <Button variant={view === 'rules' ? 'default' : 'outline'} onClick={() => setView('rules')}>
          Reglas
        </Button>
      </div>

      {view === 'summary' ? <SummaryView /> : <RulesView canEdit={canEdit} confirm={confirm} />}
    </Layout>
  );
}

function SummaryView() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detailDeviceId, setDetailDeviceId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await complianceService.getSummary());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) return <p className="text-muted-foreground">Cargando…</p>;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <DataTable
        columns={[
          { key: 'hardware', label: 'Equipo', render: (r) => escapeHtml(`${r.hardwareBrand} ${r.hardwareModel}`) },
          { key: 'totalRules', label: 'Reglas aplicables' },
          { key: 'passedRules', label: 'Cumple' },
          { key: 'failedRules', label: 'Incumple' },
          {
            key: 'worstSeverity',
            label: 'Peor severidad en falla',
            render: (r) => (r.worstSeverity ? severityBadge(r.worstSeverity) : '—'),
          },
        ]}
        rows={rows}
        actions={[{ label: 'Ver detalle', onClick: (row) => setDetailDeviceId(row.id) }]}
        emptyMessage="No hay dispositivos de Backup Networking configurados todavía"
      />

      {detailDeviceId && <DeviceResultsModal deviceId={detailDeviceId} onClose={() => setDetailDeviceId(null)} />}
    </>
  );
}

function DeviceResultsModal({ deviceId, onClose }) {
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setResults(await complianceService.getDeviceResults(deviceId));
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [deviceId]);

  return (
    <Modal title="Detalle de compliance" onClose={onClose}>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : results === null ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : results.length === 0 ? (
        <p className="text-muted-foreground">No hay reglas aplicables a este dispositivo todavía.</p>
      ) : (
        <DataTable
          columns={[
            { key: 'name', label: 'Regla', render: (r) => escapeHtml(r.name) },
            { key: 'severity', label: 'Severidad', render: (r) => severityBadge(r.severity) },
            { key: 'passed', label: 'Resultado', render: (r) => passedBadge(r.passed) },
            {
              key: 'matchedSnippet',
              label: 'Línea encontrada',
              render: (r) => (r.matchedSnippet ? escapeHtml(r.matchedSnippet) : '—'),
            },
          ]}
          rows={results}
          emptyMessage="Sin resultados"
        />
      )}
    </Modal>
  );
}

function RulesView({ canEdit, confirm }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formTarget, setFormTarget] = useState(undefined); // undefined = cerrado, null = alta, objeto = edición

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRules(await complianceService.listRules());
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
          title: 'Eliminar regla',
          message: `¿Eliminar la regla "${row.name}"? Esto borra también su estado de compliance guardado en todos los dispositivos.`,
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return;
        try {
          await complianceService.removeRule(row.id);
          toast.success('Regla eliminada');
          refresh();
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
  }

  if (loading) return <p className="text-muted-foreground">Cargando…</p>;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <div className="mb-4">{canEdit && <Button onClick={() => setFormTarget(null)}>+ Nueva regla</Button>}</div>

      <DataTable
        columns={[
          { key: 'name', label: 'Nombre', render: (r) => escapeHtml(r.name) },
          {
            key: 'driver',
            label: 'Se aplica a',
            render: (r) => escapeHtml(r.driver ? netbackupDriverLabel(r.driver) : 'Todos'),
          },
          {
            key: 'matchType',
            label: 'Condición',
            render: (r) =>
              `${escapeHtml(complianceMatchTypeLabel(r.matchType))} "${escapeHtml(r.pattern)}"${r.mode === 'regex' ? ' (regex)' : ''}`,
          },
          { key: 'severity', label: 'Severidad', render: (r) => severityBadge(r.severity) },
          { key: 'active', label: 'Estado', render: (r) => activeBadge(r.active) },
        ]}
        rows={rules}
        actions={actions}
        emptyMessage="No hay reglas de compliance configuradas todavía"
      />

      {formTarget !== undefined && (
        <RuleFormModal
          existing={formTarget}
          onClose={() => setFormTarget(undefined)}
          onSaved={() => {
            setFormTarget(undefined);
            refresh();
          }}
        />
      )}
    </>
  );
}

function RuleFormModal({ existing, onClose, onSaved }) {
  const isEdit = Boolean(existing);

  return (
    <Modal title={isEdit ? `Editar "${existing.name}"` : 'Nueva regla'} onClose={onClose}>
      <Form
        fields={[
          { name: 'name', label: 'Nombre', value: existing?.name, required: true },
          { name: 'description', label: 'Descripción', value: existing?.description ?? '' },
          {
            name: 'driver',
            label: 'Se aplica a',
            type: 'select',
            value: existing?.driver ?? '',
            options: DRIVER_FILTER_OPTIONS,
            required: true,
          },
          {
            name: 'mode',
            label: 'Modo',
            type: 'select',
            value: existing?.mode ?? 'text',
            options: COMPLIANCE_MODE_OPTIONS,
            required: true,
          },
          {
            name: 'matchType',
            label: 'Tipo',
            type: 'select',
            value: existing?.matchType ?? 'must_contain',
            options: COMPLIANCE_MATCH_TYPE_OPTIONS,
            required: true,
          },
          {
            name: 'pattern',
            label: 'Texto o patrón (ej. "telnet" — en modo regex, ej. "^snmp-server community public")',
            value: existing?.pattern,
            required: true,
          },
          {
            name: 'caseSensitive',
            label: 'Distinguir mayúsculas/minúsculas',
            type: 'checkbox',
            value: existing?.caseSensitive ?? false,
          },
          {
            name: 'severity',
            label: 'Severidad',
            type: 'select',
            value: existing?.severity ?? 'warning',
            options: COMPLIANCE_SEVERITY_OPTIONS,
            required: true,
          },
          { name: 'active', label: 'Regla activa', type: 'checkbox', value: existing?.active ?? true },
        ]}
        submitLabel={isEdit ? 'Guardar cambios' : 'Crear regla'}
        onSubmit={async (values) => {
          const payload = {
            name: values.name.trim(),
            description: values.description?.trim() || '',
            driver: values.driver || null,
            mode: values.mode,
            matchType: values.matchType,
            pattern: values.pattern.trim(),
            caseSensitive: values.caseSensitive,
            severity: values.severity,
            active: values.active,
          };

          if (isEdit) {
            await complianceService.updateRule(existing.id, payload);
            toast.success('Regla actualizada');
          } else {
            await complianceService.createRule(payload);
            toast.success('Regla creada');
          }
          onSaved();
        }}
      />
    </Modal>
  );
}
