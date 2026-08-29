import { m365Service } from '../services/m365.service.js';

export async function getSettings(req, res) {
  const settings = await m365Service.getSettings();
  res.status(200).json({ success: true, data: settings });
}

export async function saveSettings(req, res) {
  const settings = await m365Service.saveSettings(req, req.body);
  res.status(200).json({ success: true, data: settings });
}

export async function sync(req, res) {
  const result = await m365Service.sync(req);
  res.status(200).json({ success: true, data: result });
}

export async function listLicenses(req, res) {
  const licenses = await m365Service.listLicenses();
  res.status(200).json({ success: true, data: licenses });
}

export async function listUsers(req, res) {
  const users = await m365Service.listUsers();
  res.status(200).json({ success: true, data: users });
}
