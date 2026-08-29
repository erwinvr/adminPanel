/**
 * pages/ProvidersDashboardPage.jsx
 *
 * Dashboard de solo lectura: qué proveedor está vinculado a qué
 * recurso del mapa de topología (aplicación, base de datos, servidor/
 * instancia o datacenter/nube). El alta/baja/edición de proveedores y
 * la gestión de esos vínculos vive en ProvidersPage.jsx (providers.edit).
 */

import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { providerService } from '../services/provider.service.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

export function ProvidersDashboardPage() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setProviders(await providerService.list());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalLinks = providers.reduce((sum, p) => sum + p.resources.length, 0);

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Proveedores y recursos</h1>
      <p className="topology-page__hint">
        Vista de solo lectura de qué proveedor abastece a cada recurso del mapa de topología (aplicaciones, bases de
        datos, servidores/instancias y datacenter/nube). Para dar de alta proveedores o modificar estos vínculos, andá a
        "Proveedores" en el menú.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <p className="topology-page__hint">
            {providers.length} proveedor{providers.length === 1 ? '' : 'es'} — {totalLinks} vínculo{totalLinks === 1 ? '' : 's'} con
            recursos.
          </p>
          <DataTable
            columns={[
              { key: 'name', label: 'Proveedor' },
              { key: 'contactEmail', label: 'Contacto' },
              {
                key: 'resources',
                label: 'Recursos vinculados',
                render: (r) =>
                  r.resources.length
                    ? r.resources.map((res) => badgeHtml(escapeHtml(res.name), 'success')).join(' ')
                    : '<span class="text-muted-foreground">Sin vincular</span>',
              },
            ]}
            rows={providers}
            emptyMessage="No hay proveedores cargados todavía"
          />
        </>
      )}
    </Layout>
  );
}
