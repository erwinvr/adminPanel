/**
 * pages/M365LicensesPage.jsx
 *
 * Licencias compradas en Microsoft 365 (subscribedSkus), tal como
 * quedaron en el último "Sincronizar ahora" de la pantalla de
 * Configuración — solo lectura, no se editan acá.
 */

import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { m365Service } from '../services/m365.service.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

export function M365LicensesPage() {
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        <DataTable
          columns={[
            { key: 'displayName', label: 'Licencia' },
            { key: 'skuPartNumber', label: 'SKU' },
            { key: 'enabledUnits', label: 'Total', render: (r) => String(r.enabledUnits) },
            { key: 'consumedUnits', label: 'Asignadas', render: (r) => String(r.consumedUnits) },
            { key: 'availableUnits', label: 'Disponibles', render: (r) => String(r.availableUnits) },
          ]}
          rows={licenses}
          emptyMessage='No hay licencias sincronizadas todavía. Andá a "Configuración" y sincronizá.'
        />
      )}
    </Layout>
  );
}
