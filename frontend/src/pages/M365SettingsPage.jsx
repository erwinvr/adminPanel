/**
 * pages/M365SettingsPage.jsx
 *
 * Parámetros de conexión a Microsoft 365 (Microsoft Graph, client
 * credentials) y disparador de sincronización manual. Requiere una app
 * registrada en Azure AD con permisos de aplicación
 * Organization.Read.All + User.Read.All (consentimiento de admin).
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { Form } from '../components/Form.jsx';
import { toast } from 'sonner';
import { m365Service } from '../services/m365.service.js';
import { SYNC_FREQUENCY_OPTIONS } from '../constants/syncFrequency.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

function formatDateTime(iso) {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleString('es-BO');
}

export function M365SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await m365Service.getSettings());
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
      const result = await m365Service.sync();
      setSyncResult({ ok: true, ...result });
      toast.success(`Sincronizado: ${result.licensesCount} licencias, ${result.usersCount} usuarios`);
      if (result.mfaWarning) toast.error(result.mfaWarning);
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
      <h1 className="text-2xl font-semibold">Microsoft 365 — Configuración</h1>
      <p className="topology-page__hint">
        Parámetros de conexión de la app registrada en Azure AD (Entra ID). Necesita permisos de aplicación
        "Organization.Read.All", "User.Read.All" y "AuditLog.Read.All" (este último para el estado de MFA) en
        Microsoft Graph, con consentimiento de administrador otorgado.
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
            key={settings.hasSecret ? 'with-secret' : 'no-secret'}
            fields={[
              { name: 'tenantId', label: 'Tenant ID (o dominio .onmicrosoft.com)', value: settings.tenantId, required: true },
              { name: 'clientId', label: 'Client ID (Application ID)', value: settings.clientId, required: true },
              {
                name: 'clientSecret',
                label: settings.hasSecret
                  ? `Client secret (configurado, termina en "${settings.clientSecretPreview}" — dejar en blanco para mantenerlo)`
                  : 'Client secret',
                type: 'password',
              },
              {
                name: 'syncIntervalMinutes',
                label: 'Frecuencia de sincronización automática',
                type: 'select',
                value: String(settings.syncIntervalMinutes ?? 0),
                options: SYNC_FREQUENCY_OPTIONS,
                required: true,
              },
            ]}
            submitLabel="Guardar configuración"
            onSubmit={async (values) => {
              await m365Service.saveSettings({ ...values, syncIntervalMinutes: Number(values.syncIntervalMinutes) });
              toast.success('Configuración guardada');
              refresh();
            }}
          />

          <h2 className="mt-8 text-base font-semibold">Sincronización</h2>
          <p className="topology-page__hint">Última sincronización: {formatDateTime(settings.lastSyncedAt)}</p>
          <p className="topology-page__hint">
            {settings.syncIntervalMinutes
              ? `Sincronización automática activa: ${SYNC_FREQUENCY_OPTIONS.find((o) => Number(o.value) === settings.syncIntervalMinutes)?.label.toLowerCase() ?? `cada ${settings.syncIntervalMinutes} min`}.`
              : 'Sincronización automática desactivada — solo manual.'}
          </p>

          <Button onClick={handleSync} disabled={syncing || !settings.hasSecret}>
            {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </Button>
          {!settings.hasSecret && (
            <p className="topology-page__hint">Guardá la configuración con un client secret antes de poder sincronizar.</p>
          )}

          {syncResult && (
            <div className="mt-4 flex flex-col gap-2">
              <Alert variant={syncResult.ok ? 'success' : 'destructive'}>
                <AlertDescription>
                  {syncResult.ok
                    ? `Sincronización exitosa: ${syncResult.licensesCount} licencias y ${syncResult.usersCount} usuarios traídos desde Microsoft 365.`
                    : `Falló la sincronización: ${syncResult.message}`}
                </AlertDescription>
              </Alert>
              {syncResult.ok && syncResult.mfaWarning && (
                <Alert variant="warning">
                  <AlertDescription>{syncResult.mfaWarning}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
