/**
 * pages/VulnSettingsPage.jsx
 *
 * Parámetros de conexión a ManageEngine Endpoint Central (parches
 * pendientes por equipo) y disparador de sincronización manual — mismo
 * patrón que Active Directory / Microsoft 365 / Backups, pero acá la
 * autenticación es un API key (generado desde la consola de Endpoint
 * Central: Admin → API Key Generation), no usuario/contraseña.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { Form } from '../components/Form.jsx';
import { toast } from 'sonner';
import { vulnService } from '../services/vuln.service.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

function formatDateTime(iso) {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleString('es-BO');
}

export function VulnSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await vulnService.getSettings());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await vulnService.sync();
      setSyncResult({ ok: true, ...result });
      toast.success(`Sincronizado: ${result.computersCount} equipos`);
      refresh();
    } catch (err) {
      setSyncResult({ ok: false, message: err.message });
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Vulnerabilidades — Configuración</h1>
      <p className="topology-page__hint">
        Parámetros de conexión a ManageEngine Endpoint Central. El API key se genera desde su consola (Admin → API Key
        Generation) — no hace falta usuario ni contraseña.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <div className="max-w-lg">
          <Form
            key={settings.hasApiKey ? 'with-key' : 'no-key'}
            fields={[
              {
                name: 'baseUrl',
                label: 'URL del servidor (ej. https://epm.empresa.local:8383)',
                value: settings.baseUrl,
                required: true,
              },
              {
                name: 'apiKey',
                label: settings.hasApiKey
                  ? `API key (configurado, termina en "${settings.apiKeyPreview}" — dejar en blanco para mantenerlo)`
                  : 'API key',
                type: 'password',
              },
            ]}
            submitLabel="Guardar configuración"
            onSubmit={async (values) => {
              await vulnService.saveSettings(values);
              toast.success('Configuración guardada');
              refresh();
            }}
          />

          <h2 className="mt-8 text-base font-semibold">Sincronización</h2>
          <p className="topology-page__hint">Última sincronización: {formatDateTime(settings.lastSyncedAt)}</p>

          <Button onClick={handleSync} disabled={syncing || !settings.hasApiKey}>
            {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </Button>
          {!settings.hasApiKey && (
            <p className="topology-page__hint">Guardá la configuración con un API key antes de poder sincronizar.</p>
          )}

          {syncResult && (
            <Alert className="mt-4" variant={syncResult.ok ? 'success' : 'destructive'}>
              <AlertDescription>
                {syncResult.ok
                  ? `Sincronización exitosa: ${syncResult.computersCount} equipos traídos desde Endpoint Central.`
                  : `Falló la sincronización: ${syncResult.message}`}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </Layout>
  );
}
