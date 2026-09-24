/**
 * pages/PAM360SettingsPage.jsx
 *
 * Parámetros de conexión a ManageEngine PAM360 (REST API, autenticada
 * con un AUTHTOKEN generado a mano en la consola — no usuario/
 * contraseña) y disparador de sincronización manual — mismo patrón
 * que Active Directory / Microsoft 365 / Veeam.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { Form } from '../components/Form.jsx';
import { toast } from 'sonner';
import { pam360Service } from '../services/pam360.service.js';
import { SYNC_FREQUENCY_OPTIONS } from '../constants/syncFrequency.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

function formatDateTime(iso) {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleString('es-BO');
}

export function PAM360SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await pam360Service.getSettings());
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
      const result = await pam360Service.sync();
      setSyncResult({ ok: true, ...result });
      toast.success(`Sincronizado: ${result.requestsCount} solicitudes de acceso`);
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
        Parámetros de conexión al servidor de ManageEngine PAM360. El AUTHTOKEN se genera desde la consola de PAM360
        (Admin → API User Accounts) — una cuenta con permiso de solo lectura sobre solicitudes de acceso alcanza.
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
            key={settings.hasAuthToken ? 'with-token' : 'no-token'}
            fields={[
              {
                name: 'baseUrl',
                label: 'URL del servidor (ej. https://pam360.empresa.local:7272)',
                value: settings.baseUrl,
                required: true,
              },
              {
                name: 'verifyTls',
                label: 'Verificar certificado TLS (desmarcar si PAM360 usa un certificado autofirmado)',
                type: 'checkbox',
                value: settings.verifyTls,
              },
              {
                name: 'timezone',
                label: 'Zona horaria del servidor PAM360 (ej. America/La_Paz, UTC)',
                value: settings.timezone,
                required: true,
              },
              {
                name: 'authToken',
                label: settings.hasAuthToken
                  ? `AUTHTOKEN (configurado, termina en "${settings.authTokenPreview}" — dejar en blanco para mantenerlo)`
                  : 'AUTHTOKEN',
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
              await pam360Service.saveSettings({ ...values, syncIntervalMinutes: Number(values.syncIntervalMinutes) });
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

          <Button onClick={handleSync} disabled={syncing || !settings.hasAuthToken}>
            {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </Button>
          {!settings.hasAuthToken && (
            <p className="topology-page__hint">Guardá la configuración con un AUTHTOKEN antes de poder sincronizar.</p>
          )}

          {syncResult && (
            <Alert className="mt-4" variant={syncResult.ok ? 'success' : 'destructive'}>
              <AlertDescription>
                {syncResult.ok
                  ? `Sincronización exitosa: ${syncResult.requestsCount} solicitudes de acceso traídas desde PAM360.`
                  : `Falló la sincronización: ${syncResult.message}`}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </Layout>
  );
}
