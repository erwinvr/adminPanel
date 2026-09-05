/**
 * utils/mailer.js
 *
 * Envío de correos transaccionales (recuperación de contraseña,
 * contraseña temporal) vía el servidor SMTP configurado en
 * "Configuración → SMTP" (smtp_settings, ver services/smtp.service.js)
 * — ya no es un log de desarrollo: usa `nodemailer` de verdad contra el
 * host configurado. Si todavía no se configuró nada, cada envío falla
 * con un mensaje claro en vez de silenciarse.
 */

import nodemailer from 'nodemailer';
import { smtpRepository } from '../repositories/smtp.repository.js';
import { decryptSecret } from './crypto.js';
import { AppError } from '../errors/AppError.js';

export class MailError extends AppError {
  constructor(message) {
    super(message, 502, 'SMTP_SEND_FAILED');
  }
}

async function getTransport() {
  const settings = await smtpRepository.getSettings();
  if (!settings?.host || !settings?.from_email) {
    throw new MailError('No hay un servidor SMTP configurado — configuralo en "Configuración → SMTP"');
  }

  const auth = settings.username
    ? { user: settings.username, pass: settings.password_encrypted ? decryptSecret(settings.password_encrypted) : undefined }
    : undefined;

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth,
  });

  return { transporter, settings };
}

/**
 * Único punto que efectivamente manda un correo — todo lo demás en
 * este archivo arma el asunto/cuerpo y llama a esto.
 * @param {{ to: string, subject: string, text: string, html: string }} params
 */
export async function sendMail({ to, subject, text, html }) {
  const { transporter, settings } = await getTransport();
  const from = settings.from_name ? `"${settings.from_name}" <${settings.from_email}>` : settings.from_email;

  try {
    await transporter.sendMail({ from, to, subject, text, html });
  } catch (err) {
    throw new MailError('No se pudo enviar el correo: ' + err.message);
  }
}

/** @param {{ to: string, resetUrl: string }} params */
export async function sendPasswordResetEmail({ to, resetUrl }) {
  await sendMail({
    to,
    subject: 'Recuperación de contraseña',
    text: `Para restablecer tu contraseña, entrá a: ${resetUrl}\n\nSi no solicitaste esto, ignorá este correo.`,
    html: `<p>Para restablecer tu contraseña, hacé clic <a href="${resetUrl}">acá</a>.</p><p>Si no solicitaste esto, ignorá este correo.</p>`,
  });
}

/** @param {{ to: string, username: string, temporaryPassword: string }} params */
export async function sendTemporaryPasswordEmail({ to, username, temporaryPassword }) {
  await sendMail({
    to,
    subject: 'Tu contraseña temporal',
    text: `Usuario: ${username}\nContraseña temporal: ${temporaryPassword}\n\nSe te va a pedir cambiarla la próxima vez que inicies sesión.`,
    html: `<p>Usuario: <strong>${username}</strong></p><p>Contraseña temporal: <strong>${temporaryPassword}</strong></p><p>Se te va a pedir cambiarla la próxima vez que inicies sesión.</p>`,
  });
}
