/**
 * jobs/syncScheduler.js
 *
 * Job en segundo plano que dispara la sincronización automática de
 * Active Directory y Microsoft 365 según la frecuencia configurada en
 * cada página de Configuración (`sync_interval_minutes` en
 * ad_settings/m365_settings — 0/null desactiva el job para esa
 * integración, queda solo el botón "Sincronizar ahora").
 *
 * No usa una librería de cron: la frecuencia configurable es "cada N
 * minutos" simple, no expresiones cron completas — alcanza con un
 * timer que revisa periódicamente si a cada integración ya le toca,
 * sin sumar una dependencia nueva al proyecto.
 *
 * Cada corrida automática pasa `req = null` a `adService.sync()` /
 * `m365Service.sync()` — sin usuario, se audita con userId null
 * (mismo criterio que un evento de sistema, ver audit.service.js) y
 * queda marcada con `trigger: 'scheduled'` en los metadatos para
 * distinguirla de una sincronización manual en el registro de
 * auditoría.
 */

import { adRepository } from '../repositories/ad.repository.js';
import { m365Repository } from '../repositories/m365.repository.js';
import { adService } from '../services/ad.service.js';
import { m365Service } from '../services/m365.service.js';
import { logger } from '../config/logger.js';

const TICK_MS = 60 * 1000; // revisa cada minuto si alguna integración ya venció su intervalo

// Evita disparar una segunda corrida de la misma integración mientras
// la anterior sigue en curso (un sync real puede tardar más que TICK_MS).
const running = new Set();

function isDue(settingsRow) {
  const intervalMinutes = settingsRow?.sync_interval_minutes;
  if (!intervalMinutes) return false; // 0/null = job desactivado para esta integración

  if (!settingsRow.last_synced_at) return true; // nunca sincronizó — corre en el próximo tick

  const dueAt = new Date(settingsRow.last_synced_at).getTime() + intervalMinutes * 60 * 1000;
  return Date.now() >= dueAt;
}

async function checkAndRun(key, getSettings, runSync) {
  if (running.has(key)) return;

  const settingsRow = await getSettings();
  if (!isDue(settingsRow)) return;

  running.add(key);
  try {
    logger.info(`[sync-scheduler] Disparando sincronización automática de ${key}`);
    await runSync();
  } catch (err) {
    // El propio sync() ya audita el fallo (recordEvent con result:
    // 'failure') — acá solo se loguea para que quede en los logs del
    // proceso, el tick siguiente vuelve a intentar.
    logger.error({ err }, `[sync-scheduler] Falló la sincronización automática de ${key}`);
  } finally {
    running.delete(key);
  }
}

async function tick() {
  await checkAndRun('ad', () => adRepository.getSettings(), () => adService.sync(null));
  await checkAndRun('m365', () => m365Repository.getSettings(), () => m365Service.sync(null));
}

let intervalHandle = null;

/** Se llama una vez al arrancar el servidor (server.js) — no en tests, que importan app.js directamente. */
export function startSyncScheduler() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    tick().catch((err) => logger.error({ err }, '[sync-scheduler] Error inesperado en el tick'));
  }, TICK_MS);
  intervalHandle.unref?.(); // no debe mantener vivo el proceso por sí solo
  logger.info('[sync-scheduler] Iniciado (revisa cada 60s si hay sincronizaciones automáticas pendientes)');
}

export function stopSyncScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}
