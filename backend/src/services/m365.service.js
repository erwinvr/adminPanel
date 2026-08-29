/**
 * services/m365.service.js
 *
 * Sincronización de licencias de Microsoft 365 vía Microsoft Graph
 * (client credentials — ver integrations/microsoft365/graphClient.js).
 * `sync()` es on-demand (botón "Sincronizar ahora" en el frontend), no
 * hay un job automático programado.
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
    return { tenantId: null, clientId: null, hasSecret: false, clientSecretPreview: null, lastSyncedAt: null };
  }
  return {
    tenantId: row.tenant_id,
    clientId: row.client_id,
    hasSecret: Boolean(row.client_secret_encrypted),
    clientSecretPreview: row.client_secret_preview,
    lastSyncedAt: row.last_synced_at,
  };
}

export const m365Service = {
  async getSettings() {
    return toPublicSettings(await m365Repository.getSettings());
  },

  async saveSettings(req, { tenantId, clientId, clientSecret }) {
    const actorId = req.session.userId;
    const changes = {
      tenant_id: tenantId,
      client_id: clientId,
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
      metadata: { tenantId, clientId, secretUpdated: Boolean(clientSecret) },
    });

    return toPublicSettings(row);
  },

  async sync(req) {
    const settingsRow = await m365Repository.getSettings();
    if (!settingsRow?.tenant_id || !settingsRow?.client_id || !settingsRow?.client_secret_encrypted) {
      throw new ValidationError('Configurá el tenant, el client ID y el client secret antes de sincronizar');
    }

    const actorId = req.session.userId;
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
        metadata: { error: err.message },
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
      metadata: { licensesCount: licenses.length, usersCount: users.length, mfaWarning },
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
