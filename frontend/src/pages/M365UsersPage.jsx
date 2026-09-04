/**
 * pages/M365UsersPage.jsx
 *
 * Usuarios de Microsoft 365 y qué licencias tienen asignadas, tal como
 * quedaron en el último sync — solo lectura.
 */

import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { m365Service } from '../services/m365.service.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';

export function M365UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setUsers(await m365Service.listUsers());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Microsoft 365 — Usuarios sincronizados</h1>
      <p className="topology-page__hint">Datos del último sync (ver "Microsoft 365 → Configuración" para actualizar).</p>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
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
          rows={users}
          emptyMessage='No hay usuarios sincronizados todavía. Andá a "Configuración" y sincronizá.'
        />
      )}
    </Layout>
  );
}
