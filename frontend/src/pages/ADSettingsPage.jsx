/**
 * pages/ADSettingsPage.jsx
 *
 * Parámetros de conexión a un Active Directory on-prem vía LDAP/LDAPS
 * (bind simple con una cuenta de servicio de solo lectura) y disparador
 * de sincronización manual — mismo patrón que Microsoft 365
 * (M365SettingsPage.jsx), pero LDAP en vez de OAuth2/Graph.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { Form } from '../components/Form.jsx';
import { toast } from 'sonner';
import { adService } from '../services/ad.service.js';
import { SYNC_FREQUENCY_OPTIONS } from '../constants/syncFrequency.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

function formatDateTime(iso) {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleString('es-BO');
}

export function ADSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await adService.getSettings());
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
      const result = await adService.sync();
      setSyncResult({ ok: true, ...result });
      toast.success(`Sincronizado: ${result.usersCount} usuarios`);
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
      <h1 className="text-2xl font-semibold">Active Directory — Configuración</h1>
      <p className="topology-page__hint">
        Parámetros de conexión al controlador de dominio vía LDAP/LDAPS. La cuenta de servicio (bind DN) solo
        necesita permiso de lectura sobre el base DN indicado.
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
              { name: 'host', label: 'Servidor (host del controlador de dominio)', value: settings.host, required: true },
              { name: 'port', label: 'Puerto', type: 'number', value: settings.port ?? 389, required: true },
              { name: 'useTls', label: 'Usar LDAPS (TLS)', type: 'checkbox', value: settings.useTls },
              { name: 'bindDn', label: 'Bind DN (cuenta de servicio)', value: settings.bindDn, required: true },
              {
                name: 'bindPassword',
                label: settings.hasPassword
                  ? `Contraseña (configurada, termina en "${settings.bindPasswordPreview}" — dejar en blanco para mantenerla)`
                  : 'Contraseña',
                type: 'password',
              },
              { name: 'baseDn', label: 'Base DN (ej. OU=Usuarios,DC=empresa,DC=local)', value: settings.baseDn, required: true },
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
              await adService.saveSettings({ ...values, port: Number(values.port), syncIntervalMinutes: Number(values.syncIntervalMinutes) });
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
                  ? `Sincronización exitosa: ${syncResult.usersCount} usuarios traídos desde Active Directory.`
                  : `Falló la sincronización: ${syncResult.message}`}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </Layout>
  );
}
