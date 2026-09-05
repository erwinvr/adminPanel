/**
 * jobs/syncScheduler.js
 *
 * Job en segundo plano que dispara:
 *  - la sincronización automática de Active Directory y Microsoft 365
 *    según `sync_interval_minutes` en ad_settings/m365_settings (una
 *    sola fila de configuración por integración), y
 *  - el backup automático de CADA dispositivo de "Backup Networking"
 *    según su propio `sync_interval_minutes` en netbackup_devices
 *    (acá son varios dispositivos, cada uno con su frecuencia).
 * En los tres casos, 0/null desactiva el job automático — queda solo
 * el botón manual ("Sincronizar ahora" / "Descargar ahora").
 *
 * No usa una librería de cron: la frecuencia configurable es "cada N
 * minutos" simple, no expresiones cron completas — alcanza con un
 * timer que revisa periódicamente si a cada uno ya le toca, sin sumar
 * una dependencia nueva al proyecto.
 *
 * Cada corrida automática pasa `req = null` a `adService.sync()` /
 * `m365Service.sync()` / `netbackupService.runBackup()` — sin usuario,
 * se audita con userId null (mismo criterio que un evento de sistema,
 * ver audit.service.js) y queda marcada con `trigger: 'scheduled'` en
 * los metadatos para distinguirla de una corrida manual en el
 * registro de auditoría.
 */

import { adRepository } from '../repositories/ad.repository.js';
import { m365Repository } from '../repositories/m365.repository.js';
import { netbackupRepository } from '../repositories/netbackup.repository.js';
import { adService } from '../services/ad.service.js';
import { m365Service } from '../services/m365.service.js';
import { netbackupService } from '../services/netbackup.service.js';
import { logger } from '../config/logger.js';

const TICK_MS = 60 * 1000; // revisa cada minuto si algo ya venció su intervalo

// Evita disparar una segunda corrida de la misma integración/dispositivo
// mientras la anterior sigue en curso (una corrida real puede tardar
// más que TICK_MS).
const running = new Set();

function isDue(intervalMinutes, lastRunAt) {
  if (!intervalMinutes) return false; // 0/null = job desactivado

  if (!lastRunAt) return true; // nunca corrió — corre en el próximo tick

  const dueAt = new Date(lastRunAt).getTime() + intervalMinutes * 60 * 1000;
  return Date.now() >= dueAt;
}

async function checkAndRun(key, getSettings, runSync) {
  if (running.has(key)) return;

  const settingsRow = await getSettings();
  if (!isDue(settingsRow?.sync_interval_minutes, settingsRow?.last_synced_at)) return;

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

async function checkAndRunNetbackupDevices() {
  const devices = await netbackupRepository.listSchedulableDevices();
  for (const device of devices) {
    const key = `netbackup:${device.id}`;
    if (running.has(key)) continue;
    if (!isDue(device.sync_interval_minutes, device.last_run_at)) continue;

    running.add(key);
    (async () => {
      try {
        logger.info(`[sync-scheduler] Disparando backup automático del dispositivo ${device.id}`);
        await netbackupService.runBackup(null, device.id);
      } catch (err) {
        logger.error({ err }, `[sync-scheduler] Falló el backup automático del dispositivo ${device.id}`);
      } finally {
        running.delete(key);
      }
    })();
  }
}

async function tick() {
  await checkAndRun('ad', () => adRepository.getSettings(), () => adService.sync(null));
  await checkAndRun('m365', () => m365Repository.getSettings(), () => m365Service.sync(null));
  await checkAndRunNetbackupDevices();
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
