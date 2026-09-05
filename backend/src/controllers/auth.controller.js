import { authService } from '../services/auth.service.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';
import { env } from '../config/env.js';

export async function login(req, res) {
  const user = await authService.login(req, req.body);
  res.status(200).json({ success: true, data: user });
}

export async function logout(req, res) {
  await authService.logout(req);
  res.status(204).send();
}

export async function me(req, res) {
  const user = await authService.getCurrentUser(req);
  res.status(200).json({ success: true, data: user });
}

export async function changePassword(req, res) {
  await authService.changePassword(req, req.body);
  res.status(204).send();
}

export async function requestPasswordReset(req, res) {
  const result = await authService.requestPasswordReset(req, req.body.email);
  if (result) {
    const resetUrl = `${env.corsOrigin}/reset-password?token=${result.rawToken}`;
    await sendPasswordResetEmail({ to: result.user.email, resetUrl });
  }
  // Respuesta genérica siempre, exista o no el email — evita user enumeration.
  res.status(200).json({
    success: true,
    data: { message: 'Si el correo existe, se enviaron instrucciones de recuperación' },
  });
}

export async function confirmPasswordReset(req, res) {
  await authService.confirmPasswordReset(req, req.body);
  res.status(204).send();
}

export async function forgotPassword(req, res) {
  await authService.forgotPassword(req, req.body.username);
  // Respuesta genérica siempre, exista o no el usuario — evita user enumeration.
  res.status(200).json({
    success: true,
    data: { message: 'Si el usuario existe, se envió un correo con una contraseña temporal' },
  });
}
