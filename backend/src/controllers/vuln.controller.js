import { vulnService } from '../services/vuln.service.js';

export async function getSettings(req, res) {
  const settings = await vulnService.getSettings();
  res.status(200).json({ success: true, data: settings });
}

export async function saveSettings(req, res) {
  const settings = await vulnService.saveSettings(req, req.body);
  res.status(200).json({ success: true, data: settings });
}

export async function sync(req, res) {
  const result = await vulnService.sync(req);
  res.status(200).json({ success: true, data: result });
}

export async function getDashboard(req, res) {
  const data = await vulnService.getDashboard();
  res.status(200).json({ success: true, data });
}
