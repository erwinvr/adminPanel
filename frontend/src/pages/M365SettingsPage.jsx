/**
 * pages/M365SettingsPage.jsx
 *
 * Parámetros de conexión a Microsoft 365 (Microsoft Graph, client
 * credentials) y disparador de sincronización manual. Requiere una app
 * registrada en Azure AD con permisos de aplicación
 * Organization.Read.All + User.Read.All (consentimiento de admin).
 */

import { Layout } from '../components/Layout.jsx';
import { SyncSection } from '../components/SyncSection.jsx';
import { useSettings } from '../hooks/useSettings.js';
import { Form } from '../components/Form.jsx';
import { toast } from 'sonner';
import { m365Service } from '../services/m365.service.js';
import { SYNC_FREQUENCY_OPTIONS } from '../constants/syncFrequency.js';
import { Badge } from '@/components/ui/badge.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

// "Empresa.com, @otra.com\n tercera.com" → ['empresa.com', 'otra.com', 'tercera.com']
function parseDomains(text) {
  const domains = (text ?? '')
    .split(/[\s,;]+/)
    .map((d) => d.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean);
  return [...new Set(domains)];
}

function badgeHtmlNode(admitted) {
  return <Badge variant={admitted ? 'success' : 'secondary'}>{admitted ? 'Se admite' : 'Se ignora'}</Badge>;
}

export function M365SettingsPage() {
  const { settings, loading, error, refresh } = useSettings(m365Service.getSettings);

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Microsoft 365 — Configuración</h1>
      <p className="topology-page__hint">
        Parámetros de conexión de la app registrada en Azure AD (Entra ID). Necesita permisos de aplicación
        "Organization.Read.All" y "User.Read.All" en Microsoft Graph, con consentimiento de administrador otorgado.
        Para el estado de MFA sin licencia adicional agregá también "UserAuthenticationMethod.Read.All" (si el tenant
        tiene Entra ID P1/P2 se usa el reporte de registro con "AuditLog.Read.All"). Lee los métodos registrados de
        cada usuario habilitado, por lo que en tenants grandes la sincronización puede tardar un poco más.
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
                name: 'allowedDomains',
                label: 'Dominios a admitir (separados por coma — vacío = todos; el resto de los usuarios se ignora)',
                value: (settings.allowedDomains ?? []).join(', '),
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
              await m365Service.saveSettings({
                ...values,
                allowedDomains: parseDomains(values.allowedDomains),
                syncIntervalMinutes: Number(values.syncIntervalMinutes),
              });
              toast.success('Configuración guardada');
              refresh();
            }}
          />

          {settings.detectedDomains?.length > 0 && (
            <div className="mt-4">
              <p className="topology-page__hint">
                Dominios detectados en el último sync (usuarios del tenant, antes de filtrar). El dominio es el del
                userPrincipalName; un invitado externo tiene el dominio del tenant (.onmicrosoft.com).
              </p>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {settings.detectedDomains.map(({ domain, count }) => {
                  const admitted = !settings.allowedDomains?.length || settings.allowedDomains.includes(domain);
                  return (
                    <li key={domain} className="flex items-center gap-2">
                      {badgeHtmlNode(admitted)}
                      <span>
                        {domain} — {count} usuario{count === 1 ? '' : 's'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <SyncSection
            lastSyncedAt={settings.lastSyncedAt}
            syncIntervalMinutes={settings.syncIntervalMinutes}
            canSync={settings.hasSecret}
            missingCredentialMessage="Guardá la configuración con un client secret antes de poder sincronizar."
            onSync={m365Service.sync}
            getSyncStatus={m365Service.getSyncStatus}
            progressLabel={(p) => (p.phase === 'mfa' ? `(leyendo MFA: ${p.done} de ${p.total} usuarios)` : '')}
            summarize={(r) => ({
              message: `Sincronización exitosa: ${r.licensesCount} licencias y ${r.usersCount} usuarios traídos desde Microsoft 365${r.ignoredUsersCount ? ` (${r.ignoredUsersCount} ignorados por el filtro de dominios)` : ''}.`,
              toast: `Sincronizado: ${r.licensesCount} licencias, ${r.usersCount} usuarios`,
              extraWarning: [r.mfaWarning, r.usageReportsWarning].filter(Boolean).join(' ') || undefined,
            })}
            onSynced={refresh}
          />
        </div>
      )}
    </Layout>
  );
}
