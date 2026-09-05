/**
 * services/m365.service.js
 *
 * Sincronización de licencias de Microsoft 365 vía Microsoft Graph
 * (client credentials — ver integrations/microsoft365/graphClient.js).
 * `sync()` se dispara de dos formas: manual (botón "Sincronizar ahora",
 * con `req` real de la sesión autenticada) o automática
 * (jobs/syncScheduler.js, con `req = null` — sin usuario, se audita con
 * userId null igual que un evento de sistema). La frecuencia del job
 * automático es `sync_interval_minutes` en m365_settings (0/null =
 * desactivado).
 */

import { m365Repository } from '../repositories/m365.repository.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import {
  getAccessToken,
  fetchSubscribedSkus,
  fetchUsersWithLicenses,
  fetchUserRegistrationDetails,
} from '../integrations/microsoft365/graphClient.js';
import { friendlySkuName } from '../integrations/microsoft365/skuNames.js';
import { recordEvent } from '../audit/audit.service.js';
import { ValidationError } from '../errors/AppError.js';

function toPublicSettings(row) {
  if (!row) {
    return {
      tenantId: null,
      clientId: null,
      hasSecret: false,
      clientSecretPreview: null,
      lastSyncedAt: null,
      syncIntervalMinutes: null,
    };
  }
  return {
    tenantId: row.tenant_id,
    clientId: row.client_id,
    hasSecret: Boolean(row.client_secret_encrypted),
    clientSecretPreview: row.client_secret_preview,
    lastSyncedAt: row.last_synced_at,
    syncIntervalMinutes: row.sync_interval_minutes,
  };
}

export const m365Service = {
  async getSettings() {
    return toPublicSettings(await m365Repository.getSettings());
  },

  async saveSettings(req, { tenantId, clientId, clientSecret, syncIntervalMinutes }) {
    const actorId = req.session.userId;
    const changes = {
      tenant_id: tenantId,
      client_id: clientId,
      sync_interval_minutes: syncIntervalMinutes || null,
      updated_by: actorId,
      updated_at: new Date(),
    };
    if (clientSecret) {
      changes.client_secret_encrypted = encryptSecret(clientSecret);
      changes.client_secret_preview = clientSecret.slice(-4);
    }

    const row = await m365Repository.upsertSettings(changes);

    await recordEvent({
      userId: actorId,
      action: 'm365.settings.update',
      resource: 'm365_settings',
      resourceId: row.id,
      result: 'success',
      req,
      metadata: { tenantId, clientId, syncIntervalMinutes: changes.sync_interval_minutes, secretUpdated: Boolean(clientSecret) },
    });

    return toPublicSettings(row);
  },

  // `req` es null cuando lo dispara el job automático (jobs/syncScheduler.js)
  // en vez del botón "Sincronizar ahora" — sin sesión de usuario.
  async sync(req = null) {
    const settingsRow = await m365Repository.getSettings();
    if (!settingsRow?.tenant_id || !settingsRow?.client_id || !settingsRow?.client_secret_encrypted) {
      throw new ValidationError('Configurá el tenant, el client ID y el client secret antes de sincronizar');
    }

    const actorId = req?.session?.userId ?? null;
    const trigger = req ? 'manual' : 'scheduled';
    const clientSecret = decryptSecret(settingsRow.client_secret_encrypted);

    let skus;
    let graphUsers;
    let mfaWarning = null;
    let registrationDetails = [];
    try {
      const accessToken = await getAccessToken({ tenantId: settingsRow.tenant_id, clientId: settingsRow.client_id, clientSecret });
      [skus, graphUsers] = await Promise.all([fetchSubscribedSkus(accessToken), fetchUsersWithLicenses(accessToken)]);

      // El reporte de MFA pide un permiso de app aparte (AuditLog.Read.All).
      // Si no está otorgado, Graph devuelve 403 acá — no debe tumbar el
      // resto de la sincronización, solo dejar los campos de MFA en null.
      try {
        registrationDetails = await fetchUserRegistrationDetails(accessToken);
      } catch (err) {
        mfaWarning = `No se pudieron obtener datos de MFA (¿falta el permiso "AuditLog.Read.All" en la app de Azure AD?): ${err.message}`;
      }
    } catch (err) {
      await recordEvent({
        userId: actorId,
        action: 'm365.sync',
        resource: 'm365_settings',
        resourceId: settingsRow.id,
        result: 'failure',
        req,
        metadata: { error: err.message, trigger },
      });
      throw err;
    }

    const licenses = skus.map((s) => ({
      sku_id: s.skuId,
      sku_part_number: s.skuPartNumber,
      enabled_units: s.prepaidUnits?.enabled ?? 0,
      consumed_units: s.consumedUnits ?? 0,
    }));

    const mfaByUserId = new Map(registrationDetails.map((r) => [r.id, r]));

    const users = graphUsers.map((u) => {
      const mfa = mfaByUserId.get(u.id);
      return {
        aad_object_id: u.id,
        display_name: u.displayName,
        user_principal_name: u.userPrincipalName,
        account_enabled: u.accountEnabled ?? true,
        is_mfa_registered: mfa ? mfa.isMfaRegistered : null,
        is_mfa_capable: mfa ? mfa.isMfaCapable : null,
        methods_registered: mfa ? JSON.stringify(mfa.methodsRegistered ?? []) : null,
      };
    });

    const userLicensePairs = graphUsers.flatMap((u) => (u.assignedLicenses ?? []).map((al) => ({ aadObjectId: u.id, skuId: al.skuId })));

    await m365Repository.replaceSyncedData({ licenses, users, userLicensePairs });
    const syncedAt = new Date();
    await m365Repository.upsertSettings({ last_synced_at: syncedAt });

    await recordEvent({
      userId: actorId,
      action: 'm365.sync',
      resource: 'm365_settings',
      resourceId: settingsRow.id,
      result: 'success',
      req,
      metadata: { licensesCount: licenses.length, usersCount: users.length, mfaWarning, trigger },
    });

    return { licensesCount: licenses.length, usersCount: users.length, syncedAt: syncedAt.toISOString(), mfaWarning };
  },

  async listLicenses() {
    const rows = await m365Repository.listLicenses();
    return rows.map((r) => ({
      ...r,
      displayName: friendlySkuName(r.skuPartNumber),
      availableUnits: r.enabledUnits - r.consumedUnits,
    }));
  },

  listUsers() {
    return m365Repository.listUsersWithLicenses();
  },
};
