/**
 * pages/PAM360AccessRequestsPage.jsx
 *
 * Reporte de solicitudes de acceso sincronizadas desde PAM360: quién
 * solicitó, a qué recurso/cuenta, el motivo, y el estado. Paginado del
 * lado del servidor (mismo patrón que AuditPage.jsx) porque esta tabla
 * ACUMULA en cada sync en vez de reemplazarse — puede crecer sin
 * límite, a diferencia de "Usuarios del AD" (foto acotada al tamaño
 * del directorio).
 *
 * "Inicio"/"Fin" son la VENTANA que el usuario pidió al solicitar el
 * acceso (lo único que expone el endpoint de PAM360 documentado
 * públicamente) — no necesariamente el momento real en que hizo
 * checkout/checkin de la contraseña. Ver docs/pam360.md.
 */

import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { pam360Service } from '../services/pam360.service.js';
import { usePagedList } from '../hooks/usePagedList.js';
import { Input } from '@/components/ui/input.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';
import { formatDateTime } from '@/lib/formatDateTime.js';

function statusBadge(status) {
  if (!status) return '—';
  const normalized = status.toLowerCase();
  const variant = normalized.includes('approve') ? 'success' : normalized.includes('reject') ? 'destructive' : 'secondary';
  return badgeHtml(escapeHtml(status), variant);
}

export function PAM360AccessRequestsPage() {
  const { items: requests, meta, loading, error, setSearchDebounced, goToPage } = usePagedList(pam360Service.listAccessRequests, {
    pageSize: 20,
  });

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">PAM360 — Solicitudes de acceso</h1>
      <p className="topology-page__hint">
        "Inicio" y "Fin" son la ventana que el usuario pidió al solicitar el acceso, no necesariamente el momento
        real de checkout/checkin de la contraseña (PAM360 no expone ese dato en este reporte).
      </p>
      <div className="my-4">
        <Input
          type="text"
          placeholder="Filtrar por solicitante o recurso"
          onChange={(e) => setSearchDebounced(e.target.value)}
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
              {
                key: 'requester_fullname',
                label: 'Solicitado por',
                render: (r) => escapeHtml(r.requester_fullname || r.requester_username || '—'),
              },
              { key: 'resource_name', label: 'Recurso', render: (r) => escapeHtml(r.resource_name || '—') },
              { key: 'account_name', label: 'Cuenta', render: (r) => escapeHtml(r.account_name || '—') },
              { key: 'reason', label: 'Motivo', render: (r) => escapeHtml(r.reason || '—') },
              { key: 'start_time', label: 'Inicio', render: (r) => formatDateTime(r.start_time) },
              { key: 'end_time', label: 'Fin', render: (r) => formatDateTime(r.end_time) },
              { key: 'status', label: 'Estado', render: (r) => statusBadge(r.status) },
            ]}
            rows={requests}
            emptyMessage="No hay solicitudes de acceso sincronizadas con estos filtros"
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
