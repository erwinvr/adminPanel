/**
 * services/smtp.service.js
 *
 * Configuración del servidor SMTP saliente (sección "Configuración" →
 * SMTP). A diferencia de AD/M365/Backups/Vuln, acá no hay "sincronizar"
 * — el equivalente es "Enviar correo de prueba", para verificar que el
 * servidor configurado realmente entrega correo antes de depender de
 * él para "olvidé mi contraseña".
 */

import { smtpRepository } from '../repositories/smtp.repository.js';
import { encryptSecret } from '../utils/crypto.js';
import { sendMail } from '../utils/mailer.js';
import { recordEvent } from '../audit/audit.service.js';
import { ValidationError } from '../errors/AppError.js';

function toPublicSettings(row) {
  if (!row) {
    return { host: null, port: null, secure: false, username: null, hasPassword: false, passwordPreview: null, fromEmail: null, fromName: null };
  }
  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    hasPassword: Boolean(row.password_encrypted),
    passwordPreview: row.password_preview,
    fromEmail: row.from_email,
    fromName: row.from_name,
  };
}

export const smtpService = {
  async getSettings() {
    return toPublicSettings(await smtpRepository.getSettings());
  },

  async saveSettings(req, { host, port, secure, username, password, fromEmail, fromName }) {
    const actorId = req.session.userId;
    const changes = {
      host,
      port,
      secure,
      username: username || null,
      from_email: fromEmail,
      from_name: fromName || null,
      updated_by: actorId,
      updated_at: new Date(),
    };
    if (password) {
      changes.password_encrypted = encryptSecret(password);
      changes.password_preview = password.slice(-4);
    }

    const row = await smtpRepository.upsertSettings(changes);

    await recordEvent({
      userId: actorId,
      action: 'smtp.settings.update',
      resource: 'smtp_settings',
      resourceId: row.id,
      result: 'success',
      req,
      metadata: { host, port, secure, fromEmail, passwordUpdated: Boolean(password) },
    });

    return toPublicSettings(row);
  },

  async sendTestEmail(req, to) {
    const settingsRow = await smtpRepository.getSettings();
    if (!settingsRow?.host || !settingsRow?.from_email) {
      throw new ValidationError('Configurá el servidor SMTP antes de enviar un correo de prueba');
    }

    const actorId = req.session.userId;
    try {
      await sendMail({
        to,
        subject: 'Correo de prueba — Panel de Administración',
        text: 'Si recibiste este correo, la configuración SMTP funciona correctamente.',
        html: '<p>Si recibiste este correo, la configuración SMTP funciona correctamente.</p>',
      });
    } catch (err) {
      await recordEvent({
        userId: actorId,
        action: 'smtp.test',
        resource: 'smtp_settings',
        resourceId: settingsRow.id,
        result: 'failure',
        req,
        metadata: { to, error: err.message },
      });
      throw err;
    }

    await recordEvent({
      userId: actorId,
      action: 'smtp.test',
      resource: 'smtp_settings',
      resourceId: settingsRow.id,
      result: 'success',
      req,
      metadata: { to },
    });
  },
};
