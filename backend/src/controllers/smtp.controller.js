import { smtpService } from '../services/smtp.service.js';

export async function getSettings(req, res) {
  const settings = await smtpService.getSettings();
  res.status(200).json({ success: true, data: settings });
}

export async function saveSettings(req, res) {
  const settings = await smtpService.saveSettings(req, req.body);
  res.status(200).json({ success: true, data: settings });
}

export async function sendTestEmail(req, res) {
  await smtpService.sendTestEmail(req, req.body.to);
  res.status(200).json({ success: true, data: { sent: true } });
}
