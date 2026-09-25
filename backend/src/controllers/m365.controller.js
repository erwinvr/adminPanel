import { m365Service } from '../services/m365.service.js';
import { startBackgroundSync, getSyncState } from '../jobs/syncRunner.js';

export async function getSettings(req, res) {
  const settings = await m365Service.getSettings();
  res.status(200).json({ success: true, data: settings });
}

export async function saveSettings(req, res) {
  const settings = await m365Service.saveSettings(req, req.body);
  res.status(200).json({ success: true, data: settings });
}

// Larga (el MFA por usuario tarda minutos): se ejecuta en segundo plano y
// la pantalla consulta el estado — ver jobs/syncRunner.js.
export async function sync(req, res) {
  const state = startBackgroundSync('m365', (onProgress) => m365Service.sync(req, { onProgress }));
  res.status(202).json({ success: true, data: state });
}

export async function getSyncStatus(req, res) {
  res.status(200).json({ success: true, data: getSyncState('m365') });
}

export async function listLicenses(req, res) {
  const licenses = await m365Service.listLicenses();
  res.status(200).json({ success: true, data: licenses });
}

export async function getUsersSummary(req, res) {
  res.status(200).json({ success: true, data: await m365Service.getUsersSummary() });
}

export async function listUsers(req, res) {
  const { items, pagination } = await m365Service.listUsers(req.query);
  res.status(200).json({ success: true, data: items, meta: { pagination } });
}
