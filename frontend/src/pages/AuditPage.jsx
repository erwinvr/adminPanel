import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { auditService } from '../services/audit.service.js';
import { usePagedList } from '../hooks/usePagedList.js';
import { Input } from '@/components/ui/input.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';

// Ejemplo de acción para el placeholder del filtro de cada módulo.
const EXAMPLE_ACTION = { m365: 'm365.sync', ad: 'ad.user_unlock', veeam: 'backup.sync', vuln: 'vuln.sync', pam360: 'pam360.sync' };

function resultBadge(result) {
  return badgeHtml(result, result === 'success' ? 'success' : 'destructive');
}

/**
 * Registro de auditoría de UN módulo (`module`: application, m365, ad,
 * veeam, vuln, pam360 — ver backend/src/audit/auditModules.js). Cada
 * ruta de Auditoría renderiza esta misma página con su módulo y título.
 */
export function AuditPage({ module = 'application', title = 'Aplicación' }) {
  const { items: logs, meta, loading, error, setSearchDebounced, goToPage } = usePagedList(auditService.list, {
    pageSize: 20,
    module,
  });

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Auditoría — {title}</h1>
      <div className="my-4">
        <Input
          type="text"
          placeholder={`Filtrar por acción (ej. ${module === 'application' ? 'user.create' : `${EXAMPLE_ACTION[module]}`})`}
          onChange={(e) => setSearchDebounced(e.target.value, 'action')}
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
            emptyMessage="No hay eventos de auditoría de este módulo con estos filtros"
            paginated={false}
          />
          {meta && (
            <Pagination
              page={meta.pagination.page}
              totalPages={meta.pagination.totalPages}
              onChange={goToPage}
            />
          )}
        </>
      )}
    </Layout>
  );
}
