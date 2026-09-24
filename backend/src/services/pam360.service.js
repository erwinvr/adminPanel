/**
 * services/pam360.service.js
 *
 * Sincronización con ManageEngine PAM360 (ver
 * integrations/pam360/pam360Client.js). `sync()` se dispara de dos
 * formas: manual (botón "Sincronizar ahora", con `req` real de la
 * sesión) o automática (jobs/syncScheduler.js, con `req = null` — sin
 * usuario, se audita con userId null). La frecuencia del job
 * automático es `sync_interval_minutes` en pam360_settings (0/null =
 * desactivado), igual que Active Directory/Microsoft 365/Veeam.
 */

import { pam360Repository } from '../repositories/pam360.repository.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { fetchAccessRequests } from '../integrations/pam360/pam360Client.js';
import { recordEvent } from '../audit/audit.service.js';
import { ValidationError } from '../errors/AppError.js';

function toPublicSettings(row) {
  if (!row) {
    return {
      baseUrl: null,
      verifyTls: true,
      timezone: 'UTC',
      hasAuthToken: false,
      authTokenPreview: null,
      lastSyncedAt: null,
      syncIntervalMinutes: null,
    };
  }
  return {
    baseUrl: row.base_url,
    verifyTls: row.verify_tls,
    timezone: row.timezone,
    hasAuthToken: Boolean(row.auth_token_encrypted),
    authTokenPreview: row.auth_token_preview,
    lastSyncedAt: row.last_synced_at,
    syncIntervalMinutes: row.sync_interval_minutes,
  };
}

export const pam360Service = {
  async getSettings() {
    return toPublicSettings(await pam360Repository.getSettings());
  },

  async saveSettings(req, { baseUrl, verifyTls, timezone, syncIntervalMinutes, authToken }) {
    const actorId = req.session.userId;
    const changes = {
      base_url: baseUrl,
      verify_tls: verifyTls,
      timezone,
      sync_interval_minutes: syncIntervalMinutes || null,
      updated_by: actorId,
      updated_at: new Date(),
    };
    if (authToken) {
      changes.auth_token_encrypted = encryptSecret(authToken);
      changes.auth_token_preview = authToken.slice(-4);
    }

    const row = await pam360Repository.upsertSettings(changes);

    await recordEvent({
      userId: actorId,
      action: 'pam360.settings.update',
      resource: 'pam360_settings',
      resourceId: row.id,
      result: 'success',
      req,
      metadata: { baseUrl, verifyTls, timezone, syncIntervalMinutes: changes.sync_interval_minutes, authTokenUpdated: Boolean(authToken) },
    });

    return toPublicSettings(row);
  },

  // `req` es null cuando lo dispara el job automático (jobs/syncScheduler.js).
  async sync(req = null) {
    const settingsRow = await pam360Repository.getSettings();
    if (!settingsRow?.base_url || !settingsRow?.auth_token_encrypted) {
      throw new ValidationError('Configurá la URL del servidor y el AUTHTOKEN antes de sincronizar');
    }

    const actorId = req?.session?.userId ?? null;
    const trigger = req ? 'manual' : 'scheduled';
    const authToken = decryptSecret(settingsRow.auth_token_encrypted);
    const verifyTls = settingsRow.verify_tls;

    let requests;
    try {
      requests = await fetchAccessRequests({ baseUrl: settingsRow.base_url, authToken, verifyTls, timeZone: settingsRow.timezone });
    } catch (err) {
      await recordEvent({
        userId: actorId,
        action: 'pam360.sync',
        resource: 'pam360_settings',
        resourceId: settingsRow.id,
        result: 'failure',
        req,
        metadata: { error: err.message, trigger },
      });
      throw err;
    }

    const rows = requests.map((r) => ({
      pam360_request_id: r.pam360RequestId,
      requester_username: r.requesterUsername,
      requester_fullname: r.requesterFullname,
      resource_name: r.resourceName,
      account_name: r.accountName,
      reason: r.reason,
      status: r.status,
      requested_at: r.requestedAt,
      start_time: r.startTime,
      end_time: r.endTime,
      synced_at: new Date(),
    }));

    await pam360Repository.upsertAccessRequests(rows);
    const syncedAt = new Date();
    await pam360Repository.upsertSettings({ last_synced_at: syncedAt });

    await recordEvent({
      userId: actorId,
      action: 'pam360.sync',
      resource: 'pam360_settings',
      resourceId: settingsRow.id,
      result: 'success',
      req,
      metadata: { requestsCount: rows.length, trigger },
    });

    return { requestsCount: rows.length, syncedAt: syncedAt.toISOString() };
  },

  listAccessRequests(query) {
    return pam360Repository.listAccessRequests(query);
  },
};
