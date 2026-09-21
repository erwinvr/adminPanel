/**
 * services/backup.service.js
 *
 * Sincronización con Veeam Backup & Replication (ver
 * integrations/veeam/veeamClient.js). `sync()` se dispara de dos
 * formas: manual (botón "Sincronizar ahora", con `req` real de la
 * sesión) o automática (jobs/syncScheduler.js, con `req = null` — sin
 * usuario, se audita con userId null). La frecuencia del job
 * automático es `sync_interval_minutes` en backup_settings (0/null =
 * desactivado), igual que Active Directory/Microsoft 365.
 */

import { backupRepository } from '../repositories/backup.repository.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { getAccessToken, fetchJobStates, fetchRepositoryStates } from '../integrations/veeam/veeamClient.js';
import { recordEvent } from '../audit/audit.service.js';
import { ValidationError } from '../errors/AppError.js';

function toPublicSettings(row) {
  if (!row) return { baseUrl: null, username: null, verifyTls: true, hasPassword: false, passwordPreview: null, lastSyncedAt: null, syncIntervalMinutes: null };
  return {
    baseUrl: row.base_url,
    username: row.username,
    verifyTls: row.verify_tls,
    hasPassword: Boolean(row.password_encrypted),
    passwordPreview: row.password_preview,
    lastSyncedAt: row.last_synced_at,
    syncIntervalMinutes: row.sync_interval_minutes,
  };
}

// La forma exacta del payload de Veeam puede variar levemente entre
// builds — se lee de forma defensiva (varios nombres de campo
// plausibles) en vez de asumir un único shape rígido.
function normalizeJobState(raw) {
  return {
    veeam_job_id: String(raw.id ?? raw.jobId ?? raw.name),
    name: raw.name ?? raw.jobName ?? 'Job sin nombre',
    last_status: raw.status?.lastResult ?? raw.lastResult ?? raw.status ?? 'None',
    last_run_at: raw.status?.lastRun ?? raw.lastRun ?? raw.lastRunLocal ?? null,
  };
}

function normalizeRepositoryState(raw) {
  const capacityBytes = raw.capacityBytes ?? (raw.capacityGB != null ? Math.round(raw.capacityGB * 1024 ** 3) : null);
  const freeBytes = raw.freeSpaceBytes ?? raw.freeBytes ?? ((raw.freeSpaceGB ?? raw.freeGB) != null ? Math.round((raw.freeSpaceGB ?? raw.freeGB) * 1024 ** 3) : null);
  return {
    veeam_repository_id: String(raw.id ?? raw.repositoryId ?? raw.name),
    name: raw.name ?? raw.repositoryName ?? 'Repositorio sin nombre',
    capacity_bytes: capacityBytes,
    free_bytes: freeBytes,
  };
}

export const backupService = {
  async getSettings() {
    return toPublicSettings(await backupRepository.getSettings());
  },

  async saveSettings(req, { baseUrl, username, verifyTls, syncIntervalMinutes, password }) {
    const actorId = req.session.userId;
    const changes = { base_url: baseUrl, username, verify_tls: verifyTls, sync_interval_minutes: syncIntervalMinutes || null, updated_by: actorId, updated_at: new Date() };
    if (password) {
      changes.password_encrypted = encryptSecret(password);
      changes.password_preview = password.slice(-4);
    }

    const row = await backupRepository.upsertSettings(changes);

    await recordEvent({
      userId: actorId,
      action: 'backup.settings.update',
      resource: 'backup_settings',
      resourceId: row.id,
      result: 'success',
      req,
      metadata: { baseUrl, username, verifyTls, syncIntervalMinutes: changes.sync_interval_minutes, passwordUpdated: Boolean(password) },
    });

    return toPublicSettings(row);
  },

  // `req` es null cuando lo dispara el job automático (jobs/syncScheduler.js).
  async sync(req = null) {
    const settingsRow = await backupRepository.getSettings();
    if (!settingsRow?.base_url || !settingsRow?.username || !settingsRow?.password_encrypted) {
      throw new ValidationError('Configurá la URL del servidor, el usuario y la contraseña antes de sincronizar');
    }

    const actorId = req?.session?.userId ?? null;
    const trigger = req ? 'manual' : 'scheduled';
    const password = decryptSecret(settingsRow.password_encrypted);

    let jobStates;
    let repoStates;
    try {
      const verifyTls = settingsRow.verify_tls;
      const accessToken = await getAccessToken({ baseUrl: settingsRow.base_url, username: settingsRow.username, password, verifyTls });
      [jobStates, repoStates] = await Promise.all([
        fetchJobStates(accessToken, settingsRow.base_url, verifyTls),
        fetchRepositoryStates(accessToken, settingsRow.base_url, verifyTls),
      ]);
    } catch (err) {
      await recordEvent({
        userId: actorId,
        action: 'backup.sync',
        resource: 'backup_settings',
        resourceId: settingsRow.id,
        result: 'failure',
        req,
        metadata: { error: err.message, trigger },
      });
      throw err;
    }

    const jobs = jobStates.map(normalizeJobState);
    const repositories = repoStates.map(normalizeRepositoryState);

    await backupRepository.replaceSyncedJobs(jobs);
    await backupRepository.replaceSyncedRepositories(repositories);
    const syncedAt = new Date();
    await backupRepository.upsertSettings({ last_synced_at: syncedAt });

    await recordEvent({
      userId: actorId,
      action: 'backup.sync',
      resource: 'backup_settings',
      resourceId: settingsRow.id,
      result: 'success',
      req,
      metadata: { jobsCount: jobs.length, repositoriesCount: repositories.length, trigger },
    });

    return { jobsCount: jobs.length, repositoriesCount: repositories.length, syncedAt: syncedAt.toISOString() };
  },

  async getDashboard() {
    const [jobs, repositories] = await Promise.all([backupRepository.listJobs(), backupRepository.listRepositories()]);

    const statusCounts = jobs.reduce((acc, j) => {
      const key = j.lastStatus || 'None';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totalJobs: jobs.length,
      statusCounts,
      jobs,
      repositories: repositories.map((r) => ({
        ...r,
        // Bytes viajan como string desde pg (bigint) — se convierten acá,
        // ya normalizados, para que el frontend reciba números directos.
        capacityBytes: r.capacityBytes != null ? Number(r.capacityBytes) : null,
        freeBytes: r.freeBytes != null ? Number(r.freeBytes) : null,
      })),
    };
  },
};
