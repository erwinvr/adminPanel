/**
 * services/auth.service.js
 *
 * Lógica de negocio de autenticación: login, logout, recuperación de
 * contraseña, cambio de contraseña. Los controllers de auth son delgados
 * y delegan aquí toda la decisión.
 */

import { randomBytes, createHash } from 'node:crypto';
import { db } from '../config/database.js';
import { userRepository } from '../repositories/user.repository.js';
import { roleRepository } from '../repositories/role.repository.js';
import { hashPassword, verifyPassword, checkPasswordPolicy } from '../auth/password.js';
import { regenerateSession, destroySession } from '../auth/session.js';
import { recordEvent } from '../audit/audit.service.js';
import { resolveEffectivePermissions } from '../permissions/permissionResolver.js';
import { env } from '../config/env.js';
import { AuthenticationError, ValidationError } from '../errors/AppError.js';

// Mensaje genérico e idéntico para credenciales inválidas, sin importar
// si el usuario existe, está inactivo, o la contraseña es incorrecta —
// mitiga user enumeration.
const GENERIC_LOGIN_ERROR = 'Usuario o contraseña incorrectos';

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export const authService = {
  /**
   * @param {import('express').Request} req
   * @param {{ identifier: string, password: string }} credentials
   */
  async login(req, { identifier, password }) {
    const user = await userRepository.findByUsernameOrEmailWithSecrets(identifier.toLowerCase());

    if (!user) {
      // Se ejecuta un hash "señuelo" para que el tiempo de respuesta no
      // delate si el usuario existe o no (mitigación adicional de timing
      // attack para user enumeration).
      await verifyPassword(password, '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      await recordEvent({ action: 'auth.login', resource: 'session', result: 'failure', req, metadata: { reason: 'user_not_found', identifier } });
      throw new AuthenticationError(GENERIC_LOGIN_ERROR);
    }

    if (user.status === 'locked' && user.locked_until && new Date(user.locked_until) > new Date()) {
      await recordEvent({ userId: user.id, action: 'auth.login', resource: 'session', result: 'failure', req, metadata: { reason: 'account_locked' } });
      throw new AuthenticationError('Cuenta bloqueada temporalmente por múltiples intentos fallidos');
    }

    if (user.status !== 'active' && !(user.status === 'locked' && new Date(user.locked_until) <= new Date())) {
      await recordEvent({ userId: user.id, action: 'auth.login', resource: 'session', result: 'failure', req, metadata: { reason: 'inactive_account' } });
      throw new AuthenticationError(GENERIC_LOGIN_ERROR);
    }

    const passwordOk = await verifyPassword(password, user.password_hash);
    if (!passwordOk) {
      const newFailedCount = user.failed_login_count + 1;
      if (newFailedCount >= env.accountLock.maxFailedAttempts) {
        const until = new Date(Date.now() + env.accountLock.durationMs);
        await userRepository.lockUntil(user.id, until);
        await recordEvent({ userId: user.id, action: 'auth.account_locked', resource: 'user', resourceId: user.id, result: 'success', req, metadata: { failedAttempts: newFailedCount } });
      } else {
        await userRepository.incrementFailedLogin(user.id);
      }
      await recordEvent({ userId: user.id, action: 'auth.login', resource: 'session', result: 'failure', req, metadata: { reason: 'wrong_password' } });
      throw new AuthenticationError(GENERIC_LOGIN_ERROR);
    }

    // Login exitoso: resetear contador de intentos fallidos y bloqueo si lo hubiera.
    if (user.failed_login_count > 0 || user.status === 'locked') {
      await userRepository.resetFailedLogin(user.id);
    }

    const roleIds = await roleRepository.listUserRoleIds(user.id);

    // Regenerar el ID de sesión ANTES de escribir el usuario autenticado
    // — previene session fixation.
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.roleIds = roleIds;

    await recordEvent({ userId: user.id, action: 'auth.login', resource: 'session', result: 'success', req });

    return authService.getCurrentUser(req);
  },

  /**
   * @param {import('express').Request} req
   */
  async logout(req) {
    const userId = req.session?.userId ?? null;
    await destroySession(req);
    await recordEvent({ userId, action: 'auth.logout', resource: 'session', result: 'success', req });
  },

  /**
   * Devuelve el usuario actual + sus permisos efectivos, para GET /api/auth/me.
   * @param {import('express').Request} req
   */
  async getCurrentUser(req) {
    const user = await userRepository.findById(req.session.userId);
    if (!user) {
      throw new AuthenticationError();
    }
    const permissions = await resolveEffectivePermissions(req.session.roleIds ?? []);
    return { ...user, permissions };
  },

  /**
   * @param {import('express').Request} req
   * @param {{ currentPassword: string, newPassword: string }} params
   */
  async changePassword(req, { currentPassword, newPassword }) {
    const user = await userRepository.findByIdWithSecrets(req.session.userId);
    const currentOk = await verifyPassword(currentPassword, user.password_hash);
    if (!currentOk) {
      throw new ValidationError('La contraseña actual no es correcta');
    }

    const policy = checkPasswordPolicy(newPassword);
    if (!policy.valid) {
      throw new ValidationError('La nueva contraseña no cumple la política mínima', policy.reasons);
    }

    const newHash = await hashPassword(newPassword);
    await userRepository.update(user.id, { password_hash: newHash, must_change_password: false });

    // Invalida cualquier OTRA sesión activa de este usuario (ej. un
    // dispositivo perdido, o una sesión previamente comprometida) — solo
    // se conserva la sesión actual desde la que se hizo el cambio.
    await db('sessions').whereRaw("sess->>'userId' = ?", [user.id]).andWhereNot('sid', req.sessionID).del();

    await recordEvent({ userId: user.id, action: 'auth.password_change', resource: 'user', resourceId: user.id, result: 'success', req });
  },

  /**
   * Genera un token de recuperación. SIEMPRE responde con éxito genérico
   * desde el controller, exista o no el email — evita user enumeration
   * también en este flujo. El envío real del correo se resuelve en
   * utils/mailer.js (ver comentario ahí sobre el alcance de esa pieza).
   * @param {import('express').Request} req
   * @param {string} email
   */
  async requestPasswordReset(req, email) {
    const user = await userRepository.findByUsernameOrEmailWithSecrets(email.toLowerCase());
    if (!user) {
      // No se revela que el email no existe. Se registra igual en
      // auditoría (con user_id null) para poder detectar patrones de
      // enumeración si alguien prueba muchos emails distintos.
      await recordEvent({ action: 'auth.password_reset_requested', resource: 'user', result: 'failure', req, metadata: { reason: 'email_not_found' } });
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await db('password_reset_tokens').insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    await recordEvent({ userId: user.id, action: 'auth.password_reset_requested', resource: 'user', resourceId: user.id, result: 'success', req });

    return { rawToken, user }; // el controller decide qué hacer con esto (ver mailer.js)
  },

  /**
   * @param {import('express').Request} req
   * @param {{ token: string, newPassword: string }} params
   */
  async confirmPasswordReset(req, { token, newPassword }) {
    const tokenHash = hashToken(token);
    const record = await db('password_reset_tokens').where({ token_hash: tokenHash }).first();

    if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
      throw new ValidationError('El enlace de recuperación no es válido o ha expirado');
    }

    const policy = checkPasswordPolicy(newPassword);
    if (!policy.valid) {
      throw new ValidationError('La nueva contraseña no cumple la política mínima', policy.reasons);
    }

    const newHash = await hashPassword(newPassword);

    await db.transaction(async (trx) => {
      await userRepository.update(record.user_id, { password_hash: newHash, must_change_password: false }, trx);
      await trx('password_reset_tokens').where({ id: record.id }).update({ used_at: trx.fn.now() });
      // Recuperación por email implica que cualquier sesión existente
      // (posiblemente la de un atacante que tenía la contraseña vieja) debe
      // invalidarse por completo — a diferencia de changePassword, aquí no
      // hay "sesión actual legítima" que preservar.
      await trx.raw("DELETE FROM sessions WHERE sess->>'userId' = ?", [record.user_id]);
      await recordEvent({ userId: record.user_id, action: 'auth.password_reset_confirmed', resource: 'user', resourceId: record.user_id, result: 'success', req, trx });
    });
  },
};
