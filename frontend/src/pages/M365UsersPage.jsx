/**
 * pages/M365UsersPage.jsx
 *
 * Usuarios de Microsoft 365 y qué licencias tienen asignadas, tal como
 * quedaron en el último sync — solo lectura. Paginado y con búsqueda del
 * lado del servidor (ver usePagedList): un tenant grande tiene decenas de
 * miles de usuarios y no se descargan todos juntos.
 *
 * La búsqueda encuentra por nombre, email o nombre de licencia, sin
 * distinguir mayúsculas ni tildes; con varios términos, todos deben
 * coincidir.
 */

import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { m365Service } from '../services/m365.service.js';
import { usePagedList } from '../hooks/usePagedList.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Input } from '@/components/ui/input.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';

export function M365UsersPage() {
  const { items, meta, loading, error, params, setSearchDebounced, goToPage } = usePagedList(m365Service.listUsers);
  const total = meta?.pagination.total;

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Microsoft 365 — Usuarios sincronizados</h1>
      <p className="topology-page__hint">Datos del último sync (ver "Microsoft 365 → Configuración" para actualizar).</p>

      <div className="my-4 flex items-center gap-3">
        <Input
          type="search"
          onChange={(e) => setSearchDebounced(e.target.value)}
          placeholder="Buscar por nombre, email o licencia"
          className="max-w-sm"
        />
        {params.search && total !== undefined && (
          <span className="text-sm text-muted-foreground">
            {total} usuario{total === 1 ? '' : 's'} encontrado{total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'displayName', label: 'Nombre' },
              { key: 'userPrincipalName', label: 'Email' },
              {
                key: 'accountEnabled',
                label: 'Estado',
                render: (r) => badgeHtml(r.accountEnabled ? 'Activo' : 'Inactivo', r.accountEnabled ? 'success' : 'secondary'),
              },
              {
                key: 'licenses',
                label: 'Licencias asignadas',
                render: (r) => (r.licenses.length ? r.licenses.map((l) => escapeHtml(l)).join(', ') : '—'),
              },
            ]}
            rows={items}
            paginated={false}
            emptyMessage={
              loading
                ? 'Cargando…'
                : params.search
                  ? 'Ningún usuario coincide con la búsqueda'
                  : 'No hay usuarios sincronizados todavía. Andá a "Configuración" y sincronizá.'
            }
          />
          {meta && (
            <Pagination page={meta.pagination.page} totalPages={meta.pagination.totalPages} onChange={goToPage} />
          )}
        </>
      )}
    </Layout>
  );
}
