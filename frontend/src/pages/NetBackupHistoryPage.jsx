/**
 * pages/NetBackupHistoryPage.jsx
 *
 * "Backup Networking" → Historial: cada corrida (manual o automática)
 * de extracción de configuración por SSH, con su fecha, dispositivo y
 * resultado. Puramente de lectura — la configuración en sí (para las
 * corridas exitosas) se puede ver/descargar desde acá con "Ver
 * configuración".
 */

import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Modal } from '../components/Modal.jsx';
import { netbackupService } from '../services/netbackup.service.js';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';

const RESULT_LABEL = { success: 'Éxito', failure: 'Error' };
const RESULT_VARIANT = { success: 'success', failure: 'destructive' };
const TRIGGER_LABEL = { manual: 'Manual', scheduled: 'Automático' };

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-BO');
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function NetBackupHistoryPage() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewingRun, setViewingRun] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setRuns(await netbackupService.listRuns());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const actions = [
    {
      label: 'Ver configuración',
      onClick: async (row) => {
        if (row.result !== 'success') {
          toast.error('Esta corrida no tiene una configuración guardada (falló).');
          return;
        }
        try {
          setViewingRun(await netbackupService.getRunConfig(row.id));
        } catch (err) {
          toast.error(err.message);
        }
      },
    },
  ];

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Historial</h1>
      <p className="topology-page__hint">Ejecuciones de backup de configuración de equipos de networking.</p>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <DataTable
          columns={[
            { key: 'startedAt', label: 'Fecha', render: (r) => formatDateTime(r.startedAt) },
            { key: 'device', label: 'Dispositivo', render: (r) => escapeHtml(`${r.hardwareBrand} ${r.hardwareModel}`) },
            { key: 'trigger', label: 'Disparado por', render: (r) => TRIGGER_LABEL[r.trigger] ?? r.trigger },
            {
              key: 'result',
              label: 'Resultado',
              render: (r) => badgeHtml(RESULT_LABEL[r.result] ?? r.result, RESULT_VARIANT[r.result] ?? 'muted'),
            },
            { key: 'errorMessage', label: 'Detalle', render: (r) => (r.errorMessage ? escapeHtml(r.errorMessage) : '—') },
          ]}
          rows={runs}
          actions={actions}
          emptyMessage="Todavía no hay corridas registradas"
        />
      )}

      {viewingRun && (
        <Modal title={`Configuración — ${viewingRun.hardwareBrand} ${viewingRun.hardwareModel}`} onClose={() => setViewingRun(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">Extraída el {formatDateTime(viewingRun.startedAt)}</p>
            <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-3 text-xs whitespace-pre-wrap">
              {viewingRun.configOutput}
            </pre>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                downloadTextFile(
                  `${viewingRun.hardwareBrand}-${viewingRun.hardwareModel}-${viewingRun.startedAt.slice(0, 10)}.txt`,
                  viewingRun.configOutput
                )
              }
            >
              Descargar como archivo
            </Button>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
