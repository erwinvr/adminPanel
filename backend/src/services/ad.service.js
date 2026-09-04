/**
 * services/ad.service.js
 *
 * Sincronización con un Active Directory on-prem vía LDAP (ver
 * integrations/activeDirectory/ldapClient.js). `sync()` es on-demand
 * (botón "Sincronizar ahora" en el frontend), no hay un job automático
 * programado — mismo criterio que Microsoft 365 (m365.service.js).
 */

import { adRepository } from '../repositories/ad.repository.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { searchUsers } from '../integrations/activeDirectory/ldapClient.js';
import { recordEvent } from '../audit/audit.service.js';
import { ValidationError } from '../errors/AppError.js';

function toPublicSettings(row) {
  if (!row) {
    return { host: null, port: null, useTls: false, bindDn: null, baseDn: null, hasPassword: false, bindPasswordPreview: null, lastSyncedAt: null };
  }
  return {
    host: row.host,
    port: row.port,
    useTls: row.use_tls,
    bindDn: row.bind_dn,
    baseDn: row.base_dn,
    hasPassword: Boolean(row.bind_password_encrypted),
    bindPasswordPreview: row.bind_password_preview,
    lastSyncedAt: row.last_synced_at,
  };
}

export const adService = {
  async getSettings() {
    return toPublicSettings(await adRepository.getSettings());
  },

  async saveSettings(req, { host, port, useTls, bindDn, bindPassword, baseDn }) {
    const actorId = req.session.userId;
    const changes = {
      host,
      port,
      use_tls: useTls,
      bind_dn: bindDn,
      base_dn: baseDn,
      updated_by: actorId,
      updated_at: new Date(),
    };
    if (bindPassword) {
      changes.bind_password_encrypted = encryptSecret(bindPassword);
      changes.bind_password_preview = bindPassword.slice(-4);
    }

    const row = await adRepository.upsertSettings(changes);

    await recordEvent({
      userId: actorId,
      action: 'ad.settings.update',
      resource: 'ad_settings',
      resourceId: row.id,
      result: 'success',
      req,
      metadata: { host, port, useTls, bindDn, baseDn, passwordUpdated: Boolean(bindPassword) },
    });

    return toPublicSettings(row);
  },

  async sync(req) {
    const settingsRow = await adRepository.getSettings();
    if (!settingsRow?.host || !settingsRow?.bind_dn || !settingsRow?.base_dn || !settingsRow?.bind_password_encrypted) {
      throw new ValidationError('Configurá el servidor, el bind DN, el base DN y la contraseña antes de sincronizar');
    }

    const actorId = req.session.userId;
    const bindPassword = decryptSecret(settingsRow.bind_password_encrypted);

    let ldapUsers;
    try {
      ldapUsers = await searchUsers({
        host: settingsRow.host,
        port: settingsRow.port,
        useTls: settingsRow.use_tls,
        bindDn: settingsRow.bind_dn,
        bindPassword,
        baseDn: settingsRow.base_dn,
      });
    } catch (err) {
      await recordEvent({
        userId: actorId,
        action: 'ad.sync',
        resource: 'ad_settings',
        resourceId: settingsRow.id,
        result: 'failure',
        req,
        metadata: { error: err.message },
      });
      throw err;
    }

    const users = ldapUsers.map((u) => ({
      distinguished_name: u.distinguishedName,
      sam_account_name: u.samAccountName,
      display_name: u.displayName,
      ad_created_at: u.createdAt,
      last_login_at: u.lastLoginAt,
      password_last_set_at: u.passwordLastSetAt,
      enabled: u.enabled,
    }));

    await adRepository.replaceSyncedUsers(users);
    const syncedAt = new Date();
    await adRepository.upsertSettings({ last_synced_at: syncedAt });

    await recordEvent({
      userId: actorId,
      action: 'ad.sync',
      resource: 'ad_settings',
      resourceId: settingsRow.id,
      result: 'success',
      req,
      metadata: { usersCount: users.length },
    });

    return { usersCount: users.length, syncedAt: syncedAt.toISOString() };
  },

  listUsers() {
    return adRepository.listUsers();
  },
};
