/**
 * pages/BackupSettingsPage.jsx
 *
 * Parámetros de conexión a Veeam Backup & Replication (REST API v1,
 * puerto 9419 del servidor de Veeam) y disparador de sincronización
 * manual — mismo patrón que Active Directory / Microsoft 365.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { Form } from '../components/Form.jsx';
import { toast } from 'sonner';
import { backupService } from '../services/backup.service.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

function formatDateTime(iso) {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleString('es-BO');
}

export function BackupSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await backupService.getSettings());
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
      const result = await backupService.sync();
      setSyncResult({ ok: true, ...result });
      toast.success(`Sincronizado: ${result.jobsCount} jobs, ${result.repositoriesCount} repositorios`);
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
      <h1 className="text-2xl font-semibold">Configuración</h1>
      <p className="topology-page__hint">
        Parámetros de conexión al servidor de Veeam Backup & Replication. Una cuenta con rol de solo lectura alcanza
        para sincronizar jobs y repositorios.
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
            key={settings.hasPassword ? 'with-password' : 'no-password'}
            fields={[
              {
                name: 'baseUrl',
                label: 'URL del servidor (ej. https://veeam.empresa.local:9419)',
                value: settings.baseUrl,
                required: true,
              },
              { name: 'username', label: 'Usuario', value: settings.username, required: true },
              {
                name: 'password',
                label: settings.hasPassword
                  ? `Contraseña (configurada, termina en "${settings.passwordPreview}" — dejar en blanco para mantenerla)`
                  : 'Contraseña',
                type: 'password',
              },
            ]}
            submitLabel="Guardar configuración"
            onSubmit={async (values) => {
              await backupService.saveSettings(values);
              toast.success('Configuración guardada');
              refresh();
            }}
          />

          <h2 className="mt-8 text-base font-semibold">Sincronización</h2>
          <p className="topology-page__hint">Última sincronización: {formatDateTime(settings.lastSyncedAt)}</p>

          <Button onClick={handleSync} disabled={syncing || !settings.hasPassword}>
            {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </Button>
          {!settings.hasPassword && (
            <p className="topology-page__hint">Guardá la configuración con una contraseña antes de poder sincronizar.</p>
          )}

          {syncResult && (
            <Alert className="mt-4" variant={syncResult.ok ? 'success' : 'destructive'}>
              <AlertDescription>
                {syncResult.ok
                  ? `Sincronización exitosa: ${syncResult.jobsCount} jobs y ${syncResult.repositoriesCount} repositorios traídos desde Veeam.`
                  : `Falló la sincronización: ${syncResult.message}`}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </Layout>
  );
}
