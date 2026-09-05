import { useCallback, useEffect, useRef, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { auditService } from '../services/audit.service.js';
import { Input } from '@/components/ui/input.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';

function resultBadge(result) {
  return badgeHtml(result, result === 'success' ? 'success' : 'destructive');
}

export function AuditPage() {
  const [state, setState] = useState({ page: 1, pageSize: 20, action: undefined });
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, meta: m } = await auditService.list(state);
      setLogs(data);
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

  function onActionFilterChange(value) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setState((s) => ({ ...s, action: value || undefined, page: 1 }));
    }, 300);
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Registro de auditoría</h1>
      <div className="my-4">
        <Input
          type="text"
          placeholder="Filtrar por acción (ej. user.create)"
          onChange={(e) => onActionFilterChange(e.target.value)}
          className="max-w-xs"
        />
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
              { key: 'occurred_at', label: 'Fecha', render: (r) => new Date(r.occurred_at).toLocaleString('es-BO') },
              { key: 'user_username', label: 'Usuario', render: (r) => r.user_username ?? '—' },
              { key: 'action', label: 'Acción' },
              { key: 'resource', label: 'Recurso' },
              { key: 'result', label: 'Resultado', render: (r) => resultBadge(r.result) },
              { key: 'ip_address', label: 'IP' },
            ]}
            rows={logs}
            emptyMessage="No hay eventos de auditoría con estos filtros"
            paginated={false}
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
    </Layout>
  );
}
