import { smtpService } from '../services/smtp.service.js';
import { createSettingsController } from './settingsControllerFactory.js';

export const { getSettings, saveSettings } = createSettingsController(smtpService);

export async function sendTestEmail(req, res) {
  await smtpService.sendTestEmail(req, req.body.to);
  res.status(200).json({ success: true, data: { sent: true } });
}
