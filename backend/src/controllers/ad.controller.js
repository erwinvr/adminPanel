import { adService } from '../services/ad.service.js';
import { runTracked } from '../jobs/syncRunner.js';
import { ConflictError } from '../errors/AppError.js';
import { createSettingsController } from './settingsControllerFactory.js';

export const { getSettings, saveSettings } = createSettingsController(adService);

// `runTracked` (jobs/syncRunner.js) hace que esta corrida manual quede
// registrada igual que una automática — el scheduler (syncScheduler.js)
// la ve y no dispara una segunda sincronización de AD por encima mientras
// esta sigue en curso.
export async function sync(req, res) {
  const result = await runTracked('ad', () => adService.sync(req));
  if (result === null) throw new ConflictError('Ya hay una sincronización de Active Directory en curso.');
  res.status(200).json({ success: true, data: result });
}

export async function listUsers(req, res) {
  const users = await adService.listUsers();
  res.status(200).json({ success: true, data: users });
}

export async function listComputers(req, res) {
  const computers = await adService.listComputers();
  res.status(200).json({ success: true, data: computers });
}

export async function listLockedUsers(req, res) {
  const users = await adService.listLockedUsers();
  res.status(200).json({ success: true, data: users });
}

export async function listAdministrators(req, res) {
  const users = await adService.listAdministrators();
  res.status(200).json({ success: true, data: users });
}

export async function unlockUser(req, res) {
  await adService.unlockUser(req, req.params.id);
  res.status(204).send();
}
