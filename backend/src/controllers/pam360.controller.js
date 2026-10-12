import { pam360Service } from '../services/pam360.service.js';
import { runTracked } from '../jobs/syncRunner.js';
import { ConflictError } from '../errors/AppError.js';
import { createSettingsController } from './settingsControllerFactory.js';

export const { getSettings, saveSettings } = createSettingsController(pam360Service);

// Mismo criterio que ad.controller.js: `runTracked` evita que esta corrida
// manual y la automática del scheduler (clave 'pam360') se pisen.
export async function sync(req, res) {
  const result = await runTracked('pam360', () => pam360Service.sync(req));
  if (result === null) throw new ConflictError('Ya hay una sincronización de PAM360 en curso.');
  res.status(200).json({ success: true, data: result });
}

export async function listAccessRequests(req, res) {
  const result = await pam360Service.listAccessRequests(req.query);
  res.status(200).json({ success: true, data: result.items, meta: { pagination: result.pagination } });
}
