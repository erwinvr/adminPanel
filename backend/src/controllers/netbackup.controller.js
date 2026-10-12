import { netbackupService } from '../services/netbackup.service.js';
import { runTracked } from '../jobs/syncRunner.js';
import { ConflictError } from '../errors/AppError.js';

export async function listDevices(req, res) {
  const devices = await netbackupService.listDevices();
  res.status(200).json({ success: true, data: devices });
}

export async function listAvailableHardware(req, res) {
  const hardware = await netbackupService.listAvailableHardware();
  res.status(200).json({ success: true, data: hardware });
}

export async function createDevice(req, res) {
  const device = await netbackupService.createDevice(req, req.body);
  res.status(201).json({ success: true, data: device });
}

export async function updateDevice(req, res) {
  const device = await netbackupService.updateDevice(req, req.params.id, req.body);
  res.status(200).json({ success: true, data: device });
}

export async function deleteDevice(req, res) {
  await netbackupService.deleteDevice(req, req.params.id);
  res.status(204).send();
}

// Misma clave por dispositivo (`netbackup:<id>`) que usa el scheduler
// (jobs/syncScheduler.js#checkAndRunNetbackupDevices) — con `runTracked`
// esta descarga manual queda registrada ahí, así que un backup automático
// de ESTE dispositivo no arranca una segunda sesión SSH mientras la manual
// sigue en curso (antes el controller llamaba al servicio directo, sin
// pasar por ningún seguimiento compartido).
export async function runBackup(req, res) {
  const result = await runTracked(`netbackup:${req.params.id}`, () => netbackupService.runBackup(req, req.params.id));
  if (result === null) throw new ConflictError('Ya hay una descarga en curso para este dispositivo.');
  res.status(200).json({ success: true, data: result });
}

export async function listRuns(req, res) {
  const runs = await netbackupService.listRuns();
  res.status(200).json({ success: true, data: runs });
}

export async function getRunConfig(req, res) {
  const run = await netbackupService.getRunConfig(req.params.id);
  res.status(200).json({ success: true, data: run });
}

export async function getConfigSummary(req, res) {
  const summary = await netbackupService.getConfigSummary();
  res.status(200).json({ success: true, data: summary });
}

export async function listDeviceVersions(req, res) {
  const versions = await netbackupService.listDeviceVersions(req.params.id);
  res.status(200).json({ success: true, data: versions });
}

export async function diffRuns(req, res) {
  const result = await netbackupService.diffRuns(req.query.from, req.query.to);
  res.status(200).json({ success: true, data: result });
}
