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
 *  - `getSyncStatus` (opcional): para sincronizaciones LARGAS que el backend
 *    ejecuta en segundo plano (jobs/syncRunner.js): `onSync()` devuelve el
 *    estado `{ status: 'running' }` al instante y acá se consulta cada 2 s
 *    hasta que termina (`success` → `state.result`, `failure` → `state.error`).
 *    También retoma una corrida en curso al abrir/recargar la página.
 *    `progressLabel(progress)` arma el texto de avance del botón.
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SYNC_FREQUENCY_OPTIONS } from '../constants/syncFrequency.js';
import { formatDateTimeOrNever } from '@/lib/formatDateTime.js';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

function frequencyLabel(minutes) {
  const label = SYNC_FREQUENCY_OPTIONS.find((o) => Number(o.value) === minutes)?.label.toLowerCase();
  return label ?? `cada ${minutes} min`;
}

const POLL_MS = 2000;
const MAX_POLL_ERRORS = 5;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function SyncSection({
  lastSyncedAt,
  syncIntervalMinutes,
  canSync,
  missingCredentialMessage,
  onSync,
  summarize,
  onSynced,
  getSyncStatus,
  progressLabel,
}) {
  const [syncing, setSyncing] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [progress, setProgress] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Espera a que termine una sincronización en segundo plano. Devuelve su
  // resultado, o null si la pantalla se cerró mientras tanto.
  async function waitForBackgroundSync(initialState) {
    let state = initialState;
    let pollErrors = 0;
    while (mounted.current) {
      if (state.status === 'success') return state.result;
      if (state.status === 'failure') throw new Error(state.error ?? 'La sincronización falló');
      setProgress(state.progress ?? null);
      await sleep(POLL_MS);
      try {
        state = await getSyncStatus();
        pollErrors = 0;
      } catch {
        pollErrors += 1;
        if (pollErrors >= MAX_POLL_ERRORS) {
          throw new Error('Se perdió la conexión con el servidor. La sincronización puede seguir en segundo plano: revisá su resultado en Auditoría.');
        }
      }
    }
    return null;
  }

  // Al abrir la página: si ya hay una sincronización en curso (ej. se recargó), se retoma.
  useEffect(() => {
    if (!getSyncStatus) return;
    (async () => {
      try {
        const state = await getSyncStatus();
        if (state.status === 'running') await handleSync(state);
      } catch {
        /* sin estado disponible: no se muestra nada */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSync(resumeFrom) {
    setSyncing(true);
    setOutcome(null);
    setProgress(null);
    try {
      let result = resumeFrom ?? (await onSync());
      if (getSyncStatus && result?.status) result = await waitForBackgroundSync(result);
      if (result == null || !mounted.current) return;
      const summary = summarize(result);
      setOutcome({ ok: true, ...summary });
      if (summary.toastLevel === 'warning') toast.warning(summary.toast);
      else toast.success(summary.toast);
      if (summary.extraWarning) toast.error(summary.extraWarning);
      onSynced?.();
    } catch (err) {
      if (!mounted.current) return;
      setOutcome({ ok: false, message: err.message });
      toast.error(err.message);
    } finally {
      if (mounted.current) {
        setSyncing(false);
        setProgress(null);
      }
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

      <Button onClick={() => handleSync()} disabled={syncing || !canSync}>
        {syncing ? `Sincronizando…${progress && progressLabel ? ` ${progressLabel(progress)}` : ''}` : 'Sincronizar ahora'}
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
