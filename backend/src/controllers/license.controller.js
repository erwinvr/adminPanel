import { licenseService } from '../services/license.service.js';

export async function listLicenses(req, res) {
  const licenses = await licenseService.listLicenses();
  res.status(200).json({ success: true, data: licenses });
}

export async function createLicense(req, res) {
  const license = await licenseService.createLicense(req, req.body);
  res.status(201).json({ success: true, data: license });
}

export async function updateLicense(req, res) {
  const license = await licenseService.updateLicense(req, req.params.id, req.body);
  res.status(200).json({ success: true, data: license });
}

export async function deleteLicense(req, res) {
  await licenseService.deleteLicense(req, req.params.id);
  res.status(204).send();
}
