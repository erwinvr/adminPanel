/**
 * pages/BackupSettingsPage.jsx
 *
 * Parámetros de conexión a Veeam Backup & Replication (REST API v1,
 * puerto 9419 del servidor de Veeam) y disparador de sincronización
 * manual — mismo patrón que Active Directory / Microsoft 365.
 */

import { Layout } from '../components/Layout.jsx';
import { SyncSection } from '../components/SyncSection.jsx';
import { useSettings } from '../hooks/useSettings.js';
import { Form } from '../components/Form.jsx';
import { toast } from 'sonner';
import { backupService } from '../services/backup.service.js';
import { SYNC_FREQUENCY_OPTIONS } from '../constants/syncFrequency.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

export function BackupSettingsPage() {
  const { settings, loading, error, refresh } = useSettings(backupService.getSettings);

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
                name: 'verifyTls',
                label: 'Verificar certificado TLS (desmarcar si Veeam usa un certificado autofirmado)',
                type: 'checkbox',
                value: settings.verifyTls,
              },
              {
                name: 'password',
                label: settings.hasPassword
                  ? `Contraseña (configurada, termina en "${settings.passwordPreview}" — dejar en blanco para mantenerla)`
                  : 'Contraseña',
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
              await backupService.saveSettings({ ...values, syncIntervalMinutes: Number(values.syncIntervalMinutes) });
              toast.success('Configuración guardada');
              refresh();
            }}
          />

          <SyncSection
            lastSyncedAt={settings.lastSyncedAt}
            syncIntervalMinutes={settings.syncIntervalMinutes}
            canSync={settings.hasPassword}
            missingCredentialMessage="Guardá la configuración con una contraseña antes de poder sincronizar."
            onSync={backupService.sync}
            summarize={(r) => ({
              message: `Sincronización exitosa: ${r.jobsCount} jobs y ${r.repositoriesCount} repositorios traídos desde Veeam.`,
              toast: r.jobWarnings?.length
                ? `Sincronizado con advertencias: ${r.jobWarnings.length} tipo(s) de job no se pudieron leer`
                : `Sincronizado: ${r.jobsCount} jobs, ${r.repositoriesCount} repositorios`,
              toastLevel: r.jobWarnings?.length ? 'warning' : 'success',
              warnings: r.jobWarnings,
              warningsTitle: `No se pudo leer el estado de ${r.jobWarnings?.length} tipo(s) de job (el resto sincronizó bien):`,
            })}
            onSynced={refresh}
          />
        </div>
      )}
    </Layout>
  );
}
