/**
 * pages/M365UsersPage.jsx
 *
 * Usuarios de Microsoft 365 y qué licencias tienen asignadas, tal como
 * quedaron en el último sync — solo lectura.
 */

import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { m365Service } from '../services/m365.service.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Input } from '@/components/ui/input.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';

// Minúsculas y sin tildes: "jose" encuentra "José", "office" encuentra "Office".
const normalize = (text) => (text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function M365UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

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

  // Busca en nombre, email y nombres de licencia (todos los términos deben aparecer).
  const filteredUsers = useMemo(() => {
    const terms = normalize(search).split(/\s+/).filter(Boolean);
    if (!terms.length) return users;
    return users.filter((u) => {
      const haystack = normalize([u.displayName, u.userPrincipalName, ...u.licenses].join(' '));
      return terms.every((t) => haystack.includes(t));
    });
  }, [users, search]);

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
        <>
          <div className="my-4 flex items-center gap-3">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, email o licencia"
              className="max-w-sm"
            />
            {search.trim() && (
              <span className="text-sm text-muted-foreground">
                {filteredUsers.length} de {users.length} usuario{users.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <DataTable
            key={search}
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
            rows={filteredUsers}
            emptyMessage={
              users.length === 0
                ? 'No hay usuarios sincronizados todavía. Andá a "Configuración" y sincronizá.'
                : 'Ningún usuario coincide con la búsqueda'
            }
          />
        </>
      )}
    </Layout>
  );
}
