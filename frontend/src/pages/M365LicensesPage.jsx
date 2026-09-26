/**
 * pages/M365LicensesPage.jsx
 *
 * Licencias compradas en Microsoft 365 (subscribedSkus), tal como
 * quedaron en el último "Sincronizar ahora" de la pantalla de
 * Configuración — solo lectura, no se editan acá.
 */

import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { m365Service } from '../services/m365.service.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Input } from '@/components/ui/input.jsx';

// Minúsculas y sin tildes: "exchange" encuentra "Exchange Online".
const normalize = (text) => (text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function M365LicensesPage() {
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLicenses(await m365Service.listLicenses());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Un tenant tiene pocas decenas de licencias: se filtra en el navegador.
  // Busca en el nombre y en el SKU; con varios términos, todos deben coincidir.
  const filteredLicenses = useMemo(() => {
    const terms = normalize(search).split(/\s+/).filter(Boolean);
    if (!terms.length) return licenses;
    return licenses.filter((l) => {
      const haystack = normalize(`${l.displayName} ${l.skuPartNumber}`);
      return terms.every((t) => haystack.includes(t));
    });
  }, [licenses, search]);

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Microsoft 365 — Licencias compradas</h1>
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
              placeholder="Buscar por nombre de licencia o SKU"
              className="max-w-sm"
            />
            {search.trim() && (
              <span className="text-sm text-muted-foreground">
                {filteredLicenses.length} de {licenses.length} licencia{licenses.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <DataTable
            key={search}
            columns={[
              { key: 'displayName', label: 'Licencia' },
              { key: 'skuPartNumber', label: 'SKU' },
              { key: 'enabledUnits', label: 'Total', render: (r) => String(r.enabledUnits) },
              { key: 'consumedUnits', label: 'Asignadas', render: (r) => String(r.consumedUnits) },
              { key: 'availableUnits', label: 'Disponibles', render: (r) => String(r.availableUnits) },
            ]}
            rows={filteredLicenses}
            emptyMessage={
              licenses.length === 0
                ? 'No hay licencias sincronizadas todavía. Andá a "Configuración" y sincronizá.'
                : 'Ninguna licencia coincide con la búsqueda'
            }
          />
        </>
      )}
    </Layout>
  );
}
