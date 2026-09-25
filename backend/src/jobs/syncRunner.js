/**
 * jobs/syncRunner.js
 *
 * Ejecuta una sincronización LARGA en segundo plano y guarda su estado en
 * memoria (por integración) para que la pantalla lo consulte. Existe porque
 * una petición HTTP no puede durar minutos: nginx (y los navegadores) cortan
 * y el usuario ve un error aunque el backend siga trabajando — le pasó a
 * Microsoft 365, cuyo MFA por usuario tarda varios minutos.
 *
 * - `startBackgroundSync` (botón "Sincronizar ahora"): devuelve el estado
 *   enseguida; si ya hay una corrida en curso devuelve esa, sin lanzar otra.
 * - `runTracked` (job automático, jobs/syncScheduler.js): igual, pero espera
 *   a que termine — así una corrida manual y una automática nunca se pisan.
 *
 * El estado vive en memoria: se pierde si el backend se reinicia (el
 * resultado de cada corrida igual queda en Auditoría).
 */

import { logger } from '../config/logger.js';

const states = new Map();

const IDLE = { status: 'idle' };

export function getSyncState(key) {
  return states.get(key) ?? IDLE;
}

export function isSyncRunning(key) {
  return states.get(key)?.status === 'running';
}

async function execute(key, run) {
  const state = { status: 'running', startedAt: new Date().toISOString(), progress: null };
  states.set(key, state);
  const onProgress = (progress) => {
    state.progress = progress;
  };
  try {
    state.result = await run(onProgress);
    state.status = 'success';
  } catch (err) {
    state.status = 'failure';
    state.error = err.message;
    state.code = err.code;
    logger.error({ err }, `[sync-runner] Falló la sincronización de ${key}`);
  } finally {
    state.finishedAt = new Date().toISOString();
  }
  return state;
}

/**
 * @param {string} key
 * @param {(onProgress: (p: object) => void) => Promise<object>} run
 * @returns el estado actual (`running` si acaba de arrancar o ya estaba corriendo)
 */
export function startBackgroundSync(key, run) {
  if (isSyncRunning(key)) return states.get(key);
  const promise = execute(key, run);
  promise.catch(() => {});
  return states.get(key);
}

/** Corre `run` y espera; si ya hay una corrida de `key`, no hace nada y devuelve null. */
export async function runTracked(key, run) {
  if (isSyncRunning(key)) return null;
  const state = await execute(key, run);
  if (state.status === 'failure') throw new Error(state.error);
  return state.result;
}
