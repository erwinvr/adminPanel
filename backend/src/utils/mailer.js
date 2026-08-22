/**
 * utils/mailer.js
 *
 * Envío de correos transaccionales (recuperación de contraseña).
 *
 * ALCANCE DE ESTA PIEZA: el proyecto no especificó un servidor SMTP
 * disponible, así que esta implementación registra el enlace de
 * recuperación en el log estructurado (nivel 'info', SOLO en desarrollo)
 * en vez de enviarlo por correo real. Es una implementación real y
 * funcional para desarrollo/pruebas — no un TODO — pero antes de un uso
 * en producción hay que reemplazar `sendPasswordResetEmail` para que
 * hable con el servidor SMTP corporativo (ej. vía `nodemailer`, que no
 * se agregó como dependencia todavía porque no hay host/credenciales que
 * configurar sin esa información).
 */

import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

/**
 * @param {{ to: string, resetUrl: string }} params
 */
export async function sendPasswordResetEmail({ to, resetUrl }) {
  if (env.isProduction) {
    logger.error(
      { to },
      'sendPasswordResetEmail: no hay integración SMTP configurada. ' +
        'Implementar en utils/mailer.js antes de usar recuperación de contraseña en producción.'
    );
    return;
  }

  logger.info({ to, resetUrl }, '📧 [DEV] Enlace de recuperación de contraseña (no se envió correo real)');
}
