import { vulnService } from '../services/vuln.service.js';
import { runTracked } from '../jobs/syncRunner.js';
import { ConflictError } from '../errors/AppError.js';
import { createSettingsController } from './settingsControllerFactory.js';

export const { getSettings, saveSettings } = createSettingsController(vulnService);

// Mismo criterio que ad.controller.js: `runTracked` evita que esta corrida
// manual y la automática del scheduler (clave 'vuln') se pisen.
export async function sync(req, res) {
  const result = await runTracked('vuln', () => vulnService.sync(req));
  if (result === null) throw new ConflictError('Ya hay una sincronización de UEM en curso.');
  res.status(200).json({ success: true, data: result });
}

export async function getDashboard(req, res) {
  const data = await vulnService.getDashboard();
  res.status(200).json({ success: true, data });
}
