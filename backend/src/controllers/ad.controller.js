import { adService } from '../services/ad.service.js';

export async function getSettings(req, res) {
  const settings = await adService.getSettings();
  res.status(200).json({ success: true, data: settings });
}

export async function saveSettings(req, res) {
  const settings = await adService.saveSettings(req, req.body);
  res.status(200).json({ success: true, data: settings });
}

export async function sync(req, res) {
  const result = await adService.sync(req);
  res.status(200).json({ success: true, data: result });
}

export async function listUsers(req, res) {
  const users = await adService.listUsers();
  res.status(200).json({ success: true, data: users });
}

export async function listLockedUsers(req, res) {
  const users = await adService.listLockedUsers();
  res.status(200).json({ success: true, data: users });
}

export async function unlockUser(req, res) {
  await adService.unlockUser(req, req.params.id);
  res.status(204).send();
}
