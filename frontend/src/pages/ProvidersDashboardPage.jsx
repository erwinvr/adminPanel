/**
 * pages/ProvidersDashboardPage.jsx
 *
 * Dashboard de solo lectura: qué proveedor está vinculado a qué
 * recurso del mapa de topología (aplicación, base de datos, servidor/
 * instancia o datacenter/nube). El alta/baja/edición de proveedores y
 * la gestión de esos vínculos vive en ProvidersPage.jsx (providers.edit).
 *
 * `ProvidersTable` es la parte puramente de presentación — exportada
 * para que PublicDashboardPage.jsx la reuse tal cual en el enlace
 * público de "Compartir" (mismos datos, mismo render, sin repetir el
 * JSX de la tabla).
 */

import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { ShareDialog } from '../components/ShareDialog.jsx';
import { providerService } from '../services/provider.service.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';
import { Share2 } from 'lucide-react';

export function ProvidersTable({ providers }) {
  const totalLinks = providers.reduce((sum, p) => sum + p.resources.length, 0);

  return (
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
  );
}

export function ProvidersDashboardPage() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

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

  return (
    <Layout>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">Proveedores y recursos</h1>
        <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)}>
          <Share2 className="size-4" />
          Compartir
        </Button>
      </div>
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
        <ProvidersTable providers={providers} />
      )}

      {shareOpen && (
        <ShareDialog dashboardKey="providers" dashboardLabel="Proveedores y recursos" onClose={() => setShareOpen(false)} />
      )}
    </Layout>
  );
}
