/**
 * pages/PAM360SettingsPage.jsx
 *
 * Parámetros de conexión a ManageEngine PAM360 (REST API, autenticada
 * con un AUTHTOKEN generado a mano en la consola — no usuario/
 * contraseña) y disparador de sincronización manual — mismo patrón
 * que Active Directory / Microsoft 365 / Veeam.
 */

import { Layout } from '../components/Layout.jsx';
import { SyncSection } from '../components/SyncSection.jsx';
import { useSettings } from '../hooks/useSettings.js';
import { Form } from '../components/Form.jsx';
import { toast } from 'sonner';
import { pam360Service } from '../services/pam360.service.js';
import { SYNC_FREQUENCY_OPTIONS } from '../constants/syncFrequency.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

export function PAM360SettingsPage() {
  const { settings, loading, error, refresh } = useSettings(pam360Service.getSettings);

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

          <SyncSection
            lastSyncedAt={settings.lastSyncedAt}
            syncIntervalMinutes={settings.syncIntervalMinutes}
            canSync={settings.hasAuthToken}
            missingCredentialMessage="Guardá la configuración con un AUTHTOKEN antes de poder sincronizar."
            onSync={pam360Service.sync}
            summarize={(r) => ({
              message: `Sincronización exitosa: ${r.requestsCount} solicitudes de acceso traídas desde PAM360.`,
              toast: `Sincronizado: ${r.requestsCount} solicitudes de acceso`,
            })}
            onSynced={refresh}
          />
        </div>
      )}
    </Layout>
  );
}
