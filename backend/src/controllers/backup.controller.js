import { backupService } from '../services/backup.service.js';
import { runTracked } from '../jobs/syncRunner.js';
import { ConflictError } from '../errors/AppError.js';
import { createSettingsController } from './settingsControllerFactory.js';

export const { getSettings, saveSettings } = createSettingsController(backupService);

// Mismo criterio que ad.controller.js: `runTracked` evita que esta corrida
// manual y la automática del scheduler (clave 'veeam') se pisen.
export async function sync(req, res) {
  const result = await runTracked('veeam', () => backupService.sync(req));
  if (result === null) throw new ConflictError('Ya hay una sincronización de Veeam en curso.');
  res.status(200).json({ success: true, data: result });
}

export async function getDashboard(req, res) {
  const data = await backupService.getDashboard();
  res.status(200).json({ success: true, data });
}
