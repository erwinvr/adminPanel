/**
 * components/ShareDialog.jsx
 *
 * "Compartir" para los 3 dashboards de solo lectura (Mapa de
 * aplicaciones, Proveedores y recursos, Usuarios): genera un enlace
 * público que cualquiera puede abrir SIN iniciar sesión — por eso el
 * diálogo es explícito sobre esto (nunca se genera nada sin que quien
 * hace clic entienda el alcance) y siempre ofrece revocar.
 *
 * `dashboardKey` tiene que ser uno de los que el backend reconoce (ver
 * services/share.service.js — 'topology' | 'providers' | 'users-insights').
 */

import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';
import { shareService } from '../services/share.service.js';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Copy } from 'lucide-react';

function publicUrl(token) {
  return `${window.location.origin}${window.location.pathname}#/public/${token}`;
}

function formatDateTime(iso) {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleString('es-BO');
}

export function ShareDialog({ dashboardKey, dashboardLabel, onClose }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setStatus(await shareService.getStatus(dashboardKey));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardKey]);

  async function handleCreate() {
    setBusy(true);
    try {
      setStatus(await shareService.create(dashboardKey));
      toast.success('Enlace generado');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    setBusy(true);
    try {
      await shareService.revoke(dashboardKey);
      toast.success('Enlace revocado');
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl(status.token));
      toast.success('Enlace copiado al portapapeles');
    } catch {
      toast.error('No se pudo copiar — copiá el enlace manualmente');
    }
  }

  return (
    <Modal title={`Compartir "${dashboardLabel}"`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : status === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : status.active ? (
          <>
            <Alert variant="warning">
              <AlertDescription>
                Cualquiera con este enlace puede ver "{dashboardLabel}" sin iniciar sesión. Revocalo si ya no debería
                estar disponible.
              </AlertDescription>
            </Alert>
            <div className="flex items-center gap-2">
              <Input readOnly value={publicUrl(status.token)} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button type="button" variant="outline" size="icon" title="Copiar" onClick={copyLink}>
                <Copy className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Generado el {formatDateTime(status.createdAt)} · Último acceso: {formatDateTime(status.lastAccessedAt)} ·{' '}
              {status.accessCount} vista{status.accessCount === 1 ? '' : 's'}
            </p>
            <Button type="button" variant="destructive" disabled={busy} onClick={handleRevoke}>
              Revocar enlace
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Generá un enlace público para que cualquier usuario pueda ver "{dashboardLabel}" sin iniciar sesión.
              Podés revocarlo en cualquier momento.
            </p>
            <Button type="button" disabled={busy} onClick={handleCreate}>
              Generar enlace público
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
