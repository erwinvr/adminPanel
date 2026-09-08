/**
 * services/ad.service.js
 *
 * Sincronización con un Active Directory on-prem vía LDAP (ver
 * integrations/activeDirectory/ldapClient.js). `sync()` se dispara de
 * dos formas: manual (botón "Sincronizar ahora", con `req` real de la
 * sesión autenticada) o automática (jobs/syncScheduler.js, con
 * `req = null` — sin usuario, se audita con userId null igual que un
 * evento de sistema). La frecuencia del job automático es
 * `sync_interval_minutes` en ad_settings (0/null = desactivado).
 */

import { adRepository } from '../repositories/ad.repository.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { searchUsers, unlockUser as ldapUnlockUser } from '../integrations/activeDirectory/ldapClient.js';
import { recordEvent } from '../audit/audit.service.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

function toPublicSettings(row) {
  if (!row) {
    return {
      host: null,
      port: null,
      useTls: false,
      bindDn: null,
      baseDn: null,
      hasPassword: false,
      bindPasswordPreview: null,
      lastSyncedAt: null,
      syncIntervalMinutes: null,
    };
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
    syncIntervalMinutes: row.sync_interval_minutes,
  };
}

export const adService = {
  async getSettings() {
    return toPublicSettings(await adRepository.getSettings());
  },

  async saveSettings(req, { host, port, useTls, bindDn, bindPassword, baseDn, syncIntervalMinutes }) {
    const actorId = req.session.userId;
    const changes = {
      host,
      port,
      use_tls: useTls,
      bind_dn: bindDn,
      base_dn: baseDn,
      sync_interval_minutes: syncIntervalMinutes || null,
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
      metadata: { host, port, useTls, bindDn, baseDn, syncIntervalMinutes: changes.sync_interval_minutes, passwordUpdated: Boolean(bindPassword) },
    });

    return toPublicSettings(row);
  },

  // `req` es null cuando lo dispara el job automático (jobs/syncScheduler.js)
  // en vez del botón "Sincronizar ahora" — sin sesión de usuario.
  async sync(req = null) {
    const settingsRow = await adRepository.getSettings();
    if (!settingsRow?.host || !settingsRow?.bind_dn || !settingsRow?.base_dn || !settingsRow?.bind_password_encrypted) {
      throw new ValidationError('Configurá el servidor, el bind DN, el base DN y la contraseña antes de sincronizar');
    }

    const actorId = req?.session?.userId ?? null;
    const trigger = req ? 'manual' : 'scheduled';
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
        metadata: { error: err.message, trigger },
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
      locked_out: Boolean(u.lockoutTime),
      lockout_time: u.lockoutTime,
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
      metadata: { usersCount: users.length, trigger },
    });

    return { usersCount: users.length, syncedAt: syncedAt.toISOString() };
  },

  listUsers() {
    return adRepository.listUsers();
  },

  listLockedUsers() {
    return adRepository.listLockedUsers();
  },

  // Desbloquea contra el AD real (LDAP MODIFY, ver ldapClient.js) usando
  // la MISMA cuenta de servicio del sync — no hace falta una cuenta
  // separada, pero esa cuenta necesita el permiso de AD "Write
  // lockoutTime" además del de lectura que ya usa para sincronizar (ver
  // docs/active-directory.md).
  async unlockUser(req, adUserId) {
    const user = await adRepository.findUserById(adUserId);
    if (!user) throw new NotFoundError('Usuario de AD no encontrado');
    if (!user.locked_out) throw new ValidationError('Este usuario no tiene la cuenta bloqueada');

    const settingsRow = await adRepository.getSettings();
    if (!settingsRow?.host || !settingsRow?.bind_dn || !settingsRow?.bind_password_encrypted) {
      throw new ValidationError('Configurá la conexión a Active Directory antes de poder desbloquear cuentas');
    }

    const actorId = req.session.userId;
    const bindPassword = decryptSecret(settingsRow.bind_password_encrypted);

    try {
      await ldapUnlockUser({
        host: settingsRow.host,
        port: settingsRow.port,
        useTls: settingsRow.use_tls,
        bindDn: settingsRow.bind_dn,
        bindPassword,
        targetDn: user.distinguished_name,
      });
    } catch (err) {
      await recordEvent({
        userId: actorId,
        action: 'ad.user_unlock',
        resource: 'ad_user',
        resourceId: adUserId,
        result: 'failure',
        req,
        metadata: { samAccountName: user.sam_account_name, error: err.message },
      });
      throw err;
    }

    await adRepository.markUnlocked(adUserId);

    await recordEvent({
      userId: actorId,
      action: 'ad.user_unlock',
      resource: 'ad_user',
      resourceId: adUserId,
      result: 'success',
      req,
      metadata: { samAccountName: user.sam_account_name },
    });
  },
};
