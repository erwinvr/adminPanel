/**
 * pages/PublicDashboardPage.jsx
 *
 * Destino de un enlace de "Compartir" (ver components/ShareDialog.jsx
 * y services/share.service.js) — SIN <Layout> (no hay sesión: nada de
 * sidebar, usuario ni logout) y SIN pasar por ProtectedRoute. El token
 * de la URL es toda la autorización que existe acá.
 *
 * Reusa el mismo componente de presentación que la vista autenticada
 * de cada dashboard (TopologyMapView / ProvidersTable /
 * UserSecurityInsightsView) para que lo que ve un visitante anónimo
 * sea, en su alcance permitido, exactamente lo mismo que ve alguien
 * logueado — nunca una reimplementación paralela que pueda divergir.
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { shareService } from '../services/share.service.js';
import { ProvidersTable } from './ProvidersDashboardPage.jsx';
import { UserSecurityInsightsView } from './UsersInsightsPage.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

// React Flow es pesado — se carga aparte, igual que en App.jsx, para
// no sumarlo al bundle de quien nunca abre un enlace de mapa.
const TopologyMapView = lazy(() => import('./TopologyPage.jsx').then((m) => ({ default: m.TopologyMapView })));

const DASHBOARD_TITLES = {
  topology: 'Mapa de Aplicaciones',
  providers: 'Proveedores y recursos',
  'users-insights': 'Usuarios',
};

async function noopRefresh() {}

export function PublicDashboardPage() {
  const { token } = useParams();
  const [result, setResult] = useState(undefined); // undefined = cargando, null = error
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setResult(await shareService.getPublicDashboard(token));
      } catch (err) {
        setError(err.message);
        setResult(null);
      }
    })();
  }, [token]);

  const title = result ? DASHBOARD_TITLES[result.dashboardKey] : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <div className="text-sm font-semibold">Panel de Administración</div>
          <div className="text-xs text-muted-foreground">Vista pública — solo lectura, sin iniciar sesión</div>
        </div>
      </div>

      <div className="p-6">
        {result === undefined ? (
          <p className="text-muted-foreground">Cargando…</p>
        ) : result === null ? (
          <Alert variant="destructive" className="max-w-md">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <>
            <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
            {result.dashboardKey === 'topology' && (
              <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
                <TopologyMapView
                  graph={result.data.graph}
                  providers={[]}
                  providersError
                  vaultNodeIds={new Set()}
                  canEdit={false}
                  onRefresh={noopRefresh}
                />
              </Suspense>
            )}
            {result.dashboardKey === 'providers' && <ProvidersTable providers={result.data.providers} />}
            {result.dashboardKey === 'users-insights' && <UserSecurityInsightsView data={result.data} />}
          </>
        )}
      </div>
    </div>
  );
}
