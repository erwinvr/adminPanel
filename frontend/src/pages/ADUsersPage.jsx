/**
 * pages/ADUsersPage.jsx
 *
 * Usuarios de Active Directory tal como quedaron en el último sync —
 * solo lectura. Nombre completo, cuándo se creó la cuenta, su último
 * login y el último cambio de contraseña (ambos según lo que reporta
 * el controlador de dominio — lastLogonTimestamp/pwdLastSet), y si
 * está habilitada o deshabilitada.
 */

import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { adService } from '../services/ad.service.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Checkbox } from '@/components/ui/checkbox.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-BO');
}

export function ADUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [onlyNeverExpires, setOnlyNeverExpires] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setUsers(await adService.listUsers());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredUsers = useMemo(
    () => (onlyNeverExpires ? users.filter((u) => u.passwordNeverExpires) : users),
    [users, onlyNeverExpires]
  );

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Active Directory — Usuarios</h1>
      <p className="topology-page__hint">Datos del último sync (ver "Active Directory → Configuración" para actualizar).</p>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <label className="my-4 flex w-fit items-center gap-2 text-sm">
            <Checkbox checked={onlyNeverExpires} onCheckedChange={(checked) => setOnlyNeverExpires(checked === true)} />
            Solo contraseña que nunca expira
          </label>

          <DataTable
            columns={[
              { key: 'displayName', label: 'Nombre completo', render: (r) => escapeHtml(r.displayName || r.samAccountName || '—') },
              { key: 'samAccountName', label: 'Usuario' },
              { key: 'createdAt', label: 'Fecha de creación', render: (r) => formatDateTime(r.createdAt) },
              { key: 'lastLoginAt', label: 'Último login', render: (r) => formatDateTime(r.lastLoginAt) },
              { key: 'passwordLastSetAt', label: 'Último cambio de clave', render: (r) => formatDateTime(r.passwordLastSetAt) },
              {
                key: 'passwordNeverExpires',
                label: 'Contraseña nunca expira',
                render: (r) => badgeHtml(r.passwordNeverExpires ? 'Sí' : 'No', r.passwordNeverExpires ? 'warning' : 'muted'),
              },
              {
                key: 'enabled',
                label: 'Estado',
                render: (r) => badgeHtml(r.enabled ? 'Activo' : 'Inactivo', r.enabled ? 'success' : 'secondary'),
              },
            ]}
            rows={filteredUsers}
            emptyMessage={
              users.length === 0
                ? 'No hay usuarios sincronizados todavía. Andá a "Configuración" y sincronizá.'
                : 'Ningún usuario tiene la contraseña marcada como "nunca expira"'
            }
          />
        </>
      )}
    </Layout>
  );
}
