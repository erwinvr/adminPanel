/**
 * pages/VulnSettingsPage.jsx
 *
 * Parámetros de conexión a ManageEngine Endpoint Central (parches
 * pendientes por equipo) y disparador de sincronización manual — mismo
 * patrón que Active Directory / Microsoft 365 / Backups, pero acá la
 * autenticación es un API key (generado desde la consola de Endpoint
 * Central: Admin → API Key Generation), no usuario/contraseña.
 */

import { Layout } from '../components/Layout.jsx';
import { SyncSection } from '../components/SyncSection.jsx';
import { useSettings } from '../hooks/useSettings.js';
import { Form } from '../components/Form.jsx';
import { toast } from 'sonner';
import { vulnService } from '../services/vuln.service.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

export function VulnSettingsPage() {
  const { settings, loading, error, refresh } = useSettings(vulnService.getSettings);

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

          <SyncSection
            lastSyncedAt={settings.lastSyncedAt}
            canSync={settings.hasApiKey}
            missingCredentialMessage="Guardá la configuración con un API key antes de poder sincronizar."
            onSync={vulnService.sync}
            summarize={(r) => ({
              message: `Sincronización exitosa: ${r.computersCount} equipos traídos desde Endpoint Central.`,
              toast: `Sincronizado: ${r.computersCount} equipos`,
            })}
            onSynced={refresh}
          />
        </div>
      )}
    </Layout>
  );
}
