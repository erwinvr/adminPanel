/**
 * pages/ADComputersPage.jsx
 *
 * Active Directory → Equipos del AD: objetos "computer" tal como
 * quedaron en el último sync (mismo criterio de solo lectura que
 * "Usuarios del AD", ver ADUsersPage.jsx) — nombre, sistema operativo,
 * último login (lastLogonTimestamp) y si está habilitado.
 *
 * El filtro por sistema operativo se arma con los valores que
 * REALMENTE aparecen en los datos sincronizados (no una lista fija
 * hardcodeada) — así se adapta a lo que haya en cada AD sin mantener
 * un catálogo de versiones de Windows a mano.
 */

import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { adService } from '../services/ad.service.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';
import { formatDateTime } from '@/lib/formatDateTime.js';

// Radix <Select.Item> no admite value="" (lo reserva para "sin
// selección" interno) — mismo criterio que Form.jsx.
const ALL_OS_VALUE = '__all__';

export function ADComputersPage() {
  const [computers, setComputers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [osFilter, setOsFilter] = useState(ALL_OS_VALUE);

  useEffect(() => {
    (async () => {
      try {
        setComputers(await adService.listComputers());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const osOptions = useMemo(() => {
    const values = new Set(computers.map((c) => c.operatingSystem).filter(Boolean));
    return [...values].sort();
  }, [computers]);

  const filteredComputers = useMemo(
    () => (osFilter === ALL_OS_VALUE ? computers : computers.filter((c) => c.operatingSystem === osFilter)),
    [computers, osFilter]
  );

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Active Directory — Equipos del AD</h1>
      <p className="topology-page__hint">Datos del último sync (ver "Active Directory → Configuración" para actualizar).</p>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="my-4 max-w-xs">
            <Select value={osFilter} onValueChange={setOsFilter}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OS_VALUE}>Todos los sistemas operativos</SelectItem>
                {osOptions.map((os) => (
                  <SelectItem key={os} value={os}>
                    {os}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={[
              { key: 'name', label: 'Nombre', render: (r) => escapeHtml(r.name || '—') },
              { key: 'dnsHostName', label: 'Nombre DNS', render: (r) => escapeHtml(r.dnsHostName || '—') },
              {
                key: 'operatingSystem',
                label: 'Sistema operativo',
                render: (r) =>
                  r.operatingSystem
                    ? escapeHtml(`${r.operatingSystem}${r.operatingSystemVersion ? ` (${r.operatingSystemVersion})` : ''}`)
                    : '—',
              },
              { key: 'lastLoginAt', label: 'Último login', render: (r) => formatDateTime(r.lastLoginAt) },
              {
                key: 'enabled',
                label: 'Estado',
                render: (r) => badgeHtml(r.enabled ? 'Activo' : 'Inactivo', r.enabled ? 'success' : 'secondary'),
              },
            ]}
            rows={filteredComputers}
            emptyMessage={
              computers.length === 0
                ? 'No hay equipos sincronizados todavía. Andá a "Configuración" y sincronizá.'
                : 'Ningún equipo coincide con el filtro de sistema operativo'
            }
          />
        </>
      )}
    </Layout>
  );
}
