/**
 * pages/ADOperationsPage.jsx
 *
 * Active Directory → Operaciones: usuarios con la cuenta bloqueada
 * (lockout) según la última sincronización, con acción para
 * desbloquearlos — el desbloqueo pega contra el AD real (LDAP MODIFY,
 * ver backend/src/integrations/activeDirectory/ldapClient.js#unlockUser)
 * usando la misma cuenta de servicio del sync, no una cuenta aparte.
 *
 * Ver vs. desbloquear son dos permisos DISTINTOS (AD_OPERATIONS_VIEW /
 * AD_OPERATIONS_UNLOCK) — alguien puede ver quién está bloqueado sin
 * poder desbloquear.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { toast } from 'sonner';
import { adService } from '../services/ad.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { escapeHtml } from '@/lib/escapeHtml.js';

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-BO');
}

export function ADOperationsPage() {
  const { hasPermission } = useAuth();
  const canUnlock = hasPermission(PERMISSIONS.AD_OPERATIONS_UNLOCK);
  const confirm = useConfirm();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await adService.listLockedUsers());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const actions = [];
  if (canUnlock) {
    actions.push({
      label: 'Desbloquear',
      onClick: async (row) => {
        const ok = await confirm({
          title: 'Desbloquear cuenta',
          message: `¿Desbloquear la cuenta de "${row.displayName || row.samAccountName}" en Active Directory?`,
          confirmLabel: 'Desbloquear',
        });
        if (!ok) return;
        try {
          await adService.unlockUser(row.id);
          toast.success('Cuenta desbloqueada');
          refresh();
        } catch (err) {
          toast.error(err.message);
        }
      },
    });
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">Active Directory — Operaciones</h1>
      <p className="topology-page__hint">
        Usuarios con la cuenta bloqueada según la última sincronización (ver "Active Directory → Configuración").
        Desbloquear actúa sobre el Active Directory real.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <DataTable
          columns={[
            { key: 'displayName', label: 'Nombre completo', render: (r) => escapeHtml(r.displayName || r.samAccountName || '—') },
            { key: 'samAccountName', label: 'Usuario' },
            { key: 'lockoutTime', label: 'Bloqueado desde', render: (r) => formatDateTime(r.lockoutTime) },
          ]}
          rows={users}
          actions={actions}
          emptyMessage="No hay usuarios con la cuenta bloqueada"
        />
      )}
    </Layout>
  );
}
