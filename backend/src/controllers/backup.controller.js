import { backupService } from '../services/backup.service.js';

export async function getSettings(req, res) {
  const settings = await backupService.getSettings();
  res.status(200).json({ success: true, data: settings });
}

export async function saveSettings(req, res) {
  const settings = await backupService.saveSettings(req, req.body);
  res.status(200).json({ success: true, data: settings });
}

export async function sync(req, res) {
  const result = await backupService.sync(req);
  res.status(200).json({ success: true, data: result });
}

export async function getDashboard(req, res) {
  const data = await backupService.getDashboard();
  res.status(200).json({ success: true, data });
}
