/**
 * services/vuln.service.js
 *
 * Sincronización con ManageEngine Endpoint Central (parches pendientes
 * por equipo, ver integrations/endpointCentral/). `sync()` admite tanto
 * disparo manual (desde la UI) como automático (jobs/syncScheduler.js,
 * según `sync_interval_minutes` en vuln_settings) — mismo criterio que
 * ad.service.js / m365.service.js.
 */

import { vulnRepository } from '../repositories/vuln.repository.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { verifyApiKey, fetchComputerPatchSummary } from '../integrations/endpointCentral/endpointCentralClient.js';
import { recordEvent } from '../audit/audit.service.js';
import { ValidationError } from '../errors/AppError.js';

function toPublicSettings(row) {
  if (!row) return { baseUrl: null, hasApiKey: false, apiKeyPreview: null, lastSyncedAt: null, syncIntervalMinutes: null };
  return {
    baseUrl: row.base_url,
    hasApiKey: Boolean(row.api_key_encrypted),
    apiKeyPreview: row.api_key_preview,
    lastSyncedAt: row.last_synced_at,
    syncIntervalMinutes: row.sync_interval_minutes,
  };
}

// Los campos numéricos de Endpoint Central vienen como number, pero cuando el
// equipo nunca se escaneó (o ese tipo de parche no aplica) el valor es el
// string "--" en vez de 0 — Number("--") es NaN, no 0.
function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Los timestamps vienen en epoch milisegundos, o "--"/-1 cuando no hay dato
// (equipo nunca escaneado / agente nunca contactó).
function toDateFromEpochMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n) : null;
}

// La forma exacta del payload de Endpoint Central puede variar entre
// builds — se lee de forma defensiva (varios nombres de campo
// plausibles) en vez de asumir un único shape rígido. Confirmado contra
// el servidor real: no hay un solo campo de "parches faltantes", viene
// separado por tipo (Microsoft, de terceros, drivers, BIOS) y se suman.
function normalizeComputer(raw) {
  const pendingPatchesCount =
    raw.missingpatchcount ?? raw.missing_patch_count ?? raw.missingPatchesCount ?? toCount(raw.missing_ms_patches) + toCount(raw.missing_tp_patches) + toCount(raw.missing_driver_patches) + toCount(raw.missing_bios_patches);
  return {
    resource_id: String(raw.resource_id ?? raw.resourceid ?? raw.computer_id ?? raw.resourceId ?? raw.computerName),
    computer_name: raw.resource_name ?? raw.computer_name ?? raw.computerName ?? raw.resourcename ?? 'Equipo sin nombre',
    pending_patches_count: toCount(pendingPatchesCount),
    os_name: raw.os_name ?? raw.os_platform_name ?? raw.osName ?? null,
    last_successful_scan: toDateFromEpochMs(raw.last_successful_scan ?? raw.last_scan_time),
    agent_last_contact_time: toDateFromEpochMs(raw.agent_last_contact_time),
    critical_patch_count: toCount(raw.critical_patch_count),
    important_patch_count: toCount(raw.important_patch_count),
  };
}

export const vulnService = {
  async getSettings() {
    return toPublicSettings(await vulnRepository.getSettings());
  },

  async saveSettings(req, { baseUrl, apiKey, syncIntervalMinutes }) {
    if (apiKey) await verifyApiKey({ baseUrl, apiKey });

    const actorId = req.session.userId;
    const changes = { base_url: baseUrl, sync_interval_minutes: syncIntervalMinutes || null, updated_by: actorId, updated_at: new Date() };
    if (apiKey) {
      changes.api_key_encrypted = encryptSecret(apiKey);
      changes.api_key_preview = apiKey.slice(-4);
    }

    const row = await vulnRepository.upsertSettings(changes);

    await recordEvent({
      userId: actorId,
      action: 'vuln.settings.update',
      resource: 'vuln_settings',
      resourceId: row.id,
      result: 'success',
      req,
      metadata: { baseUrl, apiKeyUpdated: Boolean(apiKey), syncIntervalMinutes: changes.sync_interval_minutes },
    });

    return toPublicSettings(row);
  },

  async sync(req = null) {
    const settingsRow = await vulnRepository.getSettings();
    if (!settingsRow?.base_url || !settingsRow?.api_key_encrypted) {
      throw new ValidationError('Configurá la URL del servidor y el API key antes de sincronizar');
    }

    const actorId = req?.session?.userId ?? null;
    const trigger = req ? 'manual' : 'scheduled';
    const apiKey = decryptSecret(settingsRow.api_key_encrypted);

    let rawComputers;
    try {
      rawComputers = await fetchComputerPatchSummary({ baseUrl: settingsRow.base_url, apiKey });
    } catch (err) {
      await recordEvent({
        userId: actorId,
        action: 'vuln.sync',
        resource: 'vuln_settings',
        resourceId: settingsRow.id,
        result: 'failure',
        req,
        metadata: { error: err.message, trigger },
      });
      throw err;
    }

    const computers = rawComputers.map(normalizeComputer);

    await vulnRepository.replaceSyncedComputers(computers);
    const syncedAt = new Date();
    await vulnRepository.upsertSettings({ last_synced_at: syncedAt });

    await recordEvent({
      userId: actorId,
      action: 'vuln.sync',
      resource: 'vuln_settings',
      resourceId: settingsRow.id,
      result: 'success',
      req,
      metadata: { computersCount: computers.length, trigger },
    });

    return { computersCount: computers.length, syncedAt: syncedAt.toISOString() };
  },

  async getDashboard() {
    const [totalComputers, computersWithPending, topComputers, agentCoverage] = await Promise.all([
      vulnRepository.countComputers(),
      vulnRepository.countComputersWithPendingPatches(),
      vulnRepository.topComputersByPendingPatches(),
      vulnRepository.agentCoverageByOs(),
    ]);

    const pctWithPending = totalComputers > 0 ? Math.round((computersWithPending / totalComputers) * 1000) / 10 : 0;

    return {
      totalComputers,
      computersWithPending,
      pctWithPending,
      pctUpToDate: Math.round((100 - pctWithPending) * 10) / 10,
      topComputers,
      agentCoverage,
    };
  },
};
