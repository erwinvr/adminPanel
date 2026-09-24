import { pam360Service } from '../services/pam360.service.js';

export async function getSettings(req, res) {
  const settings = await pam360Service.getSettings();
  res.status(200).json({ success: true, data: settings });
}

export async function saveSettings(req, res) {
  const settings = await pam360Service.saveSettings(req, req.body);
  res.status(200).json({ success: true, data: settings });
}

export async function sync(req, res) {
  const result = await pam360Service.sync(req);
  res.status(200).json({ success: true, data: result });
}

export async function listAccessRequests(req, res) {
  const result = await pam360Service.listAccessRequests(req.query);
  res.status(200).json({ success: true, data: result.items, meta: { pagination: result.pagination } });
}
