/**
 * pages/ADSettingsPage.jsx
 *
 * Parámetros de conexión a un Active Directory on-prem vía LDAP/LDAPS
 * (bind simple con una cuenta de servicio de solo lectura) y disparador
 * de sincronización manual — mismo patrón que Microsoft 365
 * (M365SettingsPage.jsx), pero LDAP en vez de OAuth2/Graph.
 */

import { Layout } from '../components/Layout.jsx';
import { SyncSection } from '../components/SyncSection.jsx';
import { useSettings } from '../hooks/useSettings.js';
import { Form } from '../components/Form.jsx';
import { toast } from 'sonner';
import { adService } from '../services/ad.service.js';
import { SYNC_FREQUENCY_OPTIONS } from '../constants/syncFrequency.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

export function ADSettingsPage() {
  const { settings, loading, error, refresh } = useSettings(adService.getSettings);

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

          <SyncSection
            lastSyncedAt={settings.lastSyncedAt}
            syncIntervalMinutes={settings.syncIntervalMinutes}
            canSync={settings.hasPassword}
            missingCredentialMessage="Guardá la configuración con una contraseña antes de poder sincronizar."
            onSync={adService.sync}
            summarize={(r) => ({
              message: `Sincronización exitosa: ${r.usersCount} usuarios traídos desde Active Directory.`,
              toast: `Sincronizado: ${r.usersCount} usuarios`,
            })}
            onSynced={refresh}
          />
        </div>
      )}
    </Layout>
  );
}
