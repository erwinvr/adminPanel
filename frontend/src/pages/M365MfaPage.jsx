/**
 * pages/M365MfaPage.jsx
 *
 * Estado de MFA de los usuarios sincronizados desde Microsoft 365, tal
 * como quedó en el último sync — solo lectura. Muestra dos señales
 * separadas que trae Microsoft Graph (no se combinan en un solo
 * indicador para no asumir de más):
 *
 *  - "MFA registrado" (isMfaRegistered): el usuario configuró MFA.
 *  - "Puede autenticar con MFA" (isMfaCapable): tiene métodos
 *    registrados suficientes para completar un desafío de MFA si se
 *    le exige — un usuario con esto en "No" quedaría bloqueado si el
 *    tenant llega a exigir MFA.
 *
 * "Puede autenticar con MFA" solo la informa el reporte de registro de
 * Microsoft (requiere Entra ID P1/P2). Sin licencia, el sync lee los
 * métodos registrados de cada usuario (UserAuthenticationMethod.Read.All):
 * eso da "MFA registrado" y los métodos, pero no la capacidad por
 * política — en ese caso la columna y su resumen se ocultan.
 * Cualquier dato puede aparecer como "Sin datos" si falta el permiso, o
 * para cuentas deshabilitadas (no se consultan) — ver M365SettingsPage.jsx.
 */

import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { m365Service } from '../services/m365.service.js';
import { usePagedList } from '../hooks/usePagedList.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';

// Radix <Select.Item> no admite value="" — mismo criterio que ADComputersPage.jsx.
const ALL_VALUE = '__all__';
const MFA_FILTER_OPTIONS = [
  { value: ALL_VALUE, label: 'Todos los usuarios' },
  { value: 'registered', label: 'Solo con MFA registrado' },
  { value: 'missing', label: 'Solo sin MFA registrado' },
  { value: 'unknown', label: 'Sin datos de MFA' },
];

function triStateBadge(value) {
  if (value === true) return badgeHtml('Sí', 'success');
  if (value === false) return badgeHtml('No', 'destructive');
  return badgeHtml('Sin datos', 'muted');
}

export function M365MfaPage() {
  const { items, meta, loading, error, params, setFilter, setSearchDebounced, goToPage } = usePagedList(m365Service.listUsers);
  // Totales de TODO el tenant (no de la página visible), calculados en SQL.
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    m365Service.getUsersSummary().then(setSummary).catch(() => setSummary(null));
  }, []);

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Microsoft 365 — MFA de usuarios</h1>
      <p className="topology-page__hint">
        Datos del último sync (ver "Microsoft 365 → Configuración" para actualizar). "MFA registrado" significa que el
        usuario tiene registrado un método de segundo factor (Authenticator, teléfono, FIDO2, etc.) — no que el
        tenant se lo exija. Requiere el permiso "UserAuthenticationMethod.Read.All" (sin licencia adicional) en
        Azure AD; las cuentas deshabilitadas o sin permiso muestran "Sin datos".
      </p>

      {summary && summary.total > 0 && (
        <p className="topology-page__hint">
          {summary.withoutMfa} de {summary.total} usuario{summary.total === 1 ? '' : 's'} sin MFA registrado
          {summary.hasCapableData &&
            ` — ${summary.notMfaCapable} no podría${summary.notMfaCapable === 1 ? '' : 'n'} completar un desafío de MFA si se le${summary.notMfaCapable === 1 ? '' : 's'} exigiera`}
          .
        </p>
      )}

      <div className="my-4 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          onChange={(e) => setSearchDebounced(e.target.value)}
          placeholder="Buscar por nombre, email o licencia"
          className="max-w-sm"
        />
        <Select value={params.mfa ?? ALL_VALUE} onValueChange={(value) => setFilter('mfa', value === ALL_VALUE ? undefined : value)}>
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MFA_FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(params.mfa || params.search) && meta && (
          <span className="text-sm text-muted-foreground">
            {meta.pagination.total} usuario{meta.pagination.total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'displayName', label: 'Nombre' },
              { key: 'userPrincipalName', label: 'Email' },
              {
                key: 'accountEnabled',
                label: 'Cuenta',
                render: (r) => badgeHtml(r.accountEnabled ? 'Activa' : 'Inactiva', r.accountEnabled ? 'success' : 'secondary'),
              },
              { key: 'isMfaRegistered', label: 'MFA registrado', render: (r) => triStateBadge(r.isMfaRegistered) },
              ...(summary?.hasCapableData
                ? [{ key: 'isMfaCapable', label: 'Puede autenticar con MFA', render: (r) => triStateBadge(r.isMfaCapable) }]
                : []),
              {
                key: 'methodsRegistered',
                label: 'Métodos registrados',
                render: (r) => (r.methodsRegistered?.length ? r.methodsRegistered.map((m) => escapeHtml(m)).join(', ') : '—'),
              },
            ]}
            rows={items}
            paginated={false}
            emptyMessage={
              loading
                ? 'Cargando…'
                : params.search || params.mfa
                  ? 'Ningún usuario coincide con los filtros'
                  : 'No hay usuarios sincronizados todavía. Andá a "Configuración" y sincronizá.'
            }
          />
          {meta && (
            <Pagination page={meta.pagination.page} totalPages={meta.pagination.totalPages} onChange={goToPage} />
          )}
        </>
      )}
    </Layout>
  );
}
