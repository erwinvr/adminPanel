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
import { m365Service } from '../services/m365.service.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { badgeHtml } from '@/lib/badgeHtml.js';
import { escapeHtml } from '@/lib/escapeHtml.js';

function triStateBadge(value) {
  if (value === true) return badgeHtml('Sí', 'success');
  if (value === false) return badgeHtml('No', 'destructive');
  return badgeHtml('Sin datos', 'muted');
}

export function M365MfaPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setUsers(await m365Service.listUsers());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const withoutMfaCount = users.filter((u) => u.isMfaRegistered === false).length;
  const notCapableCount = users.filter((u) => u.isMfaCapable === false).length;
  const hasCapableData = users.some((u) => u.isMfaCapable !== null);

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Microsoft 365 — MFA de usuarios</h1>
      <p className="topology-page__hint">
        Datos del último sync (ver "Microsoft 365 → Configuración" para actualizar). "MFA registrado" significa que el
        usuario tiene registrado un método de segundo factor (Authenticator, teléfono, FIDO2, etc.) — no que el
        tenant se lo exija. Requiere el permiso "UserAuthenticationMethod.Read.All" (sin licencia adicional) en
        Azure AD; las cuentas deshabilitadas o sin permiso muestran "Sin datos".
      </p>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          {users.length > 0 && (
            <p className="topology-page__hint">
              {withoutMfaCount} de {users.length} usuario{users.length === 1 ? '' : 's'} sin MFA registrado
              {hasCapableData &&
                ` — ${notCapableCount} no podría${notCapableCount === 1 ? '' : 'n'} completar un desafío de MFA si se le${notCapableCount === 1 ? '' : 's'} exigiera`}
              .
            </p>
          )}
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
              ...(hasCapableData
                ? [{ key: 'isMfaCapable', label: 'Puede autenticar con MFA', render: (r) => triStateBadge(r.isMfaCapable) }]
                : []),
              {
                key: 'methodsRegistered',
                label: 'Métodos registrados',
                render: (r) => (r.methodsRegistered?.length ? r.methodsRegistered.map((m) => escapeHtml(m)).join(', ') : '—'),
              },
            ]}
            rows={users}
            emptyMessage='No hay usuarios sincronizados todavía. Andá a "Configuración" y sincronizá.'
          />
        </>
      )}
    </Layout>
  );
}
