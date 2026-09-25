/**
 * components/SyncSection.jsx
 *
 * Bloque "Sincronización" de las páginas de configuración de las
 * integraciones (AD, Microsoft 365, Veeam, PAM360, Vulnerabilidades):
 * última sincronización, frecuencia automática, botón "Sincronizar
 * ahora" y el resultado (éxito, advertencias o error).
 *
 * Lo propio de cada integración se pasa por props:
 *  - `onSync()`: dispara la sincronización y devuelve su resultado.
 *  - `summarize(result)`: devuelve `{ message, toast, toastLevel?, warnings?,
 *    warningsTitle?, extraWarning? }` — el texto del resultado. Con
 *    `warnings` (lista) el resultado se muestra como advertencia;
 *    `extraWarning` agrega un aviso aparte (ej. el MFA de Microsoft 365).
 *  - `syncIntervalMinutes`: si es `undefined` la integración no tiene
 *    sincronización automática y no se muestra la frecuencia.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { SYNC_FREQUENCY_OPTIONS } from '../constants/syncFrequency.js';
import { formatDateTimeOrNever } from '@/lib/formatDateTime.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

function frequencyLabel(minutes) {
  const label = SYNC_FREQUENCY_OPTIONS.find((o) => Number(o.value) === minutes)?.label.toLowerCase();
  return label ?? `cada ${minutes} min`;
}

export function SyncSection({ lastSyncedAt, syncIntervalMinutes, canSync, missingCredentialMessage, onSync, summarize, onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [outcome, setOutcome] = useState(null);

  async function handleSync() {
    setSyncing(true);
    setOutcome(null);
    try {
      const summary = summarize(await onSync());
      setOutcome({ ok: true, ...summary });
      if (summary.toastLevel === 'warning') toast.warning(summary.toast);
      else toast.success(summary.toast);
      if (summary.extraWarning) toast.error(summary.extraWarning);
      onSynced?.();
    } catch (err) {
      setOutcome({ ok: false, message: err.message });
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  }

  const hasWarnings = outcome?.ok && outcome.warnings?.length > 0;

  return (
    <>
      <h2 className="mt-8 text-base font-semibold">Sincronización</h2>
      <p className="topology-page__hint">Última sincronización: {formatDateTimeOrNever(lastSyncedAt)}</p>
      {syncIntervalMinutes !== undefined && (
        <p className="topology-page__hint">
          {syncIntervalMinutes
            ? `Sincronización automática activa: ${frequencyLabel(syncIntervalMinutes)}.`
            : 'Sincronización automática desactivada — solo manual.'}
        </p>
      )}

      <Button onClick={handleSync} disabled={syncing || !canSync}>
        {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
      </Button>
      {!canSync && <p className="topology-page__hint">{missingCredentialMessage}</p>}

      {outcome && (
        <div className="mt-4 flex flex-col gap-2">
          <Alert variant={outcome.ok ? (hasWarnings ? 'warning' : 'success') : 'destructive'}>
            <AlertDescription>
              {outcome.ok ? outcome.message : `Falló la sincronización: ${outcome.message}`}
              {hasWarnings && (
                <>
                  <p className="mt-2 font-medium">{outcome.warningsTitle}</p>
                  <ul className="mt-1 list-disc pl-5">
                    {outcome.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </>
              )}
            </AlertDescription>
          </Alert>
          {outcome.ok && outcome.extraWarning && (
            <Alert variant="warning">
              <AlertDescription>{outcome.extraWarning}</AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </>
  );
}
