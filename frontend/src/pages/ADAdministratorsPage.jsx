/**
 * pages/ADAdministratorsPage.jsx
 *
 * Active Directory → Administradores del AD: usuarios que pertenecen
 * a algún grupo incorporado de privilegio de administrador (Domain
 * Admins, Enterprise Admins, Schema Admins, Administrators — ver
 * PRIVILEGED_GROUP_NAMES en
 * backend/src/integrations/activeDirectory/ldapClient.js), tal como
 * quedaron en el último sync. La pertenencia se resuelve de forma
 * RECURSIVA del lado del backend (incluye admins que llegan por un
 * grupo anidado dentro de uno privilegiado), así que un mismo usuario
 * puede listar más de un grupo acá.
 *
 * Mismo criterio de solo lectura que "Usuarios del AD"/"Equipos del
 * AD" — los datos son la foto del último sync, no una consulta en
 * vivo contra el directorio.
 */

import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { adService } from '../services/ad.service.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';

// Radix <Select.Item> no admite value="" — mismo criterio que
// ADComputersPage.jsx/Form.jsx.
const ALL_GROUPS_VALUE = '__all__';

export function ADAdministratorsPage() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupFilter, setGroupFilter] = useState(ALL_GROUPS_VALUE);

  useEffect(() => {
    (async () => {
      try {
        setAdmins(await adService.listAdministrators());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groupOptions = useMemo(() => {
    const values = new Set(admins.flatMap((a) => a.privilegedGroups ?? []));
    return [...values].sort();
  }, [admins]);

  const filteredAdmins = useMemo(
    () =>
      groupFilter === ALL_GROUPS_VALUE
        ? admins
        : admins.filter((a) => (a.privilegedGroups ?? []).includes(groupFilter)),
    [admins, groupFilter]
  );

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Active Directory — Administradores del AD</h1>
      <p className="topology-page__hint">
        Usuarios con al menos un privilegio de administrador (Domain Admins, Enterprise Admins, Schema Admins o
        Administrators), incluyendo los que lo obtienen por un grupo anidado. Datos del último sync (ver "Active
        Directory → Configuración" para actualizar).
      </p>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="my-4 max-w-xs">
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_GROUPS_VALUE}>Todos los grupos privilegiados</SelectItem>
                {groupOptions.map((group) => (
                  <SelectItem key={group} value={group}>
                    {group}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={[
              { key: 'displayName', label: 'Nombre completo', render: (r) => escapeHtml(r.displayName || '—') },
              { key: 'samAccountName', label: 'Usuario', render: (r) => escapeHtml(r.samAccountName || '—') },
              {
                key: 'privilegedGroups',
                label: 'Grupos privilegiados',
                render: (r) =>
                  (r.privilegedGroups ?? [])
                    .map((group) => badgeHtml(escapeHtml(group), 'warning'))
                    .join(' ') || '—',
              },
              {
                key: 'enabled',
                label: 'Estado',
                render: (r) => badgeHtml(r.enabled ? 'Activo' : 'Inactivo', r.enabled ? 'success' : 'secondary'),
              },
            ]}
            rows={filteredAdmins}
            emptyMessage={
              admins.length === 0
                ? 'No se encontraron usuarios con privilegios de administrador en el último sync.'
                : 'Ningún administrador coincide con el filtro de grupo'
            }
          />
        </>
      )}
    </Layout>
  );
}
