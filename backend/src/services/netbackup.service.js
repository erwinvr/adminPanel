/**
 * services/netbackup.service.js
 *
 * "Backup Networking": respaldo de configuración de equipos de
 * networking vía SSH. Cada dispositivo vinculado a una caja del
 * inventario de hardware (tipo 'networking', con IP de administración
 * cargada) tiene sus propias credenciales SSH, comando de extracción y
 * frecuencia de backup automático — mismo patrón que Active Directory/
 * Microsoft 365 (contraseña cifrada, 0/null de frecuencia = solo
 * manual), pero acá son VARIOS dispositivos, no una fila de
 * configuración única.
 *
 * `runBackup()` se dispara de dos formas: manual (botón "Descargar
 * ahora", con `req` real de la sesión autenticada) o automática
 * (jobs/syncScheduler.js, con `req = null` — sin usuario). Cada corrida
 * queda en netbackup_runs (historial) Y auditada en audit_logs.
 */

import crypto from 'node:crypto';
import { diffLines } from 'diff';
import { netbackupRepository } from '../repositories/netbackup.repository.js';
import { inventoryRepository } from '../repositories/inventory.repository.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { fetchDeviceConfig } from '../integrations/networkBackup/sshClient.js';
import { recordEvent } from '../audit/audit.service.js';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';

function hashConfig(output) {
  return crypto.createHash('sha256').update(output).digest('hex');
}

async function assertHardwareIsUsable(hardwareId) {
  const hw = await inventoryRepository.findItemById(hardwareId);
  if (!hw) throw new NotFoundError('El equipo seleccionado no existe en el inventario de hardware');
  if (hw.type !== 'networking') throw new ValidationError('Solo se pueden configurar equipos de tipo "Networking"');
  if (!hw.management_ip) {
    throw new ValidationError('Ese equipo no tiene una IP de administración cargada — configurala primero en Hardware');
  }
  return hw;
}

function deviceLabel(row) {
  return `${row.hardwareBrand} ${row.hardwareModel}`;
}

export const netbackupService = {
  listDevices() {
    return netbackupRepository.listDevices();
  },

  listAvailableHardware() {
    return netbackupRepository.listAvailableHardware();
  },

  async createDevice(req, { hardwareId, sshPort, sshUsername, sshPassword, command, syncIntervalMinutes }) {
    await assertHardwareIsUsable(hardwareId);

    const existing = await netbackupRepository.findDeviceByHardwareId(hardwareId);
    if (existing) throw new ConflictError('Ese equipo ya tiene un dispositivo de backup configurado');

    const actorId = req.session.userId;
    const id = await netbackupRepository.createDevice({
      hardware_id: hardwareId,
      ssh_port: sshPort,
      ssh_username: sshUsername,
      ssh_password_encrypted: encryptSecret(sshPassword),
      ssh_password_preview: sshPassword.slice(-4),
      command,
      sync_interval_minutes: syncIntervalMinutes || null,
      created_by: actorId,
      updated_by: actorId,
    });

    await recordEvent({
      userId: actorId,
      action: 'netbackup.device.create',
      resource: 'netbackup_device',
      resourceId: id,
      result: 'success',
      req,
      metadata: { hardwareId, sshUsername, command },
    });

    const all = await netbackupRepository.listDevices();
    return all.find((d) => d.id === id);
  },

  async updateDevice(req, id, changes) {
    const existing = await netbackupRepository.findDeviceById(id);
    if (!existing) throw new NotFoundError('Dispositivo no encontrado');

    const actorId = req.session.userId;
    const dbChanges = {};
    if (changes.sshPort !== undefined) dbChanges.ssh_port = changes.sshPort;
    if (changes.sshUsername !== undefined) dbChanges.ssh_username = changes.sshUsername;
    if (changes.command !== undefined) dbChanges.command = changes.command;
    if (changes.syncIntervalMinutes !== undefined) dbChanges.sync_interval_minutes = changes.syncIntervalMinutes || null;
    if (changes.sshPassword) {
      dbChanges.ssh_password_encrypted = encryptSecret(changes.sshPassword);
      dbChanges.ssh_password_preview = changes.sshPassword.slice(-4);
    }
    dbChanges.updated_by = actorId;

    await netbackupRepository.updateDevice(id, dbChanges);

    await recordEvent({
      userId: actorId,
      action: 'netbackup.device.update',
      resource: 'netbackup_device',
      resourceId: id,
      result: 'success',
      req,
      metadata: { changes: Object.keys(changes) },
    });

    const all = await netbackupRepository.listDevices();
    return all.find((d) => d.id === id);
  },

  async deleteDevice(req, id) {
    const existing = await netbackupRepository.findDeviceById(id);
    if (!existing) throw new NotFoundError('Dispositivo no encontrado');

    const actorId = req.session.userId;
    await netbackupRepository.deleteDevice(id);

    await recordEvent({
      userId: actorId,
      action: 'netbackup.device.delete',
      resource: 'netbackup_device',
      resourceId: id,
      result: 'success',
      req,
      metadata: {},
    });
  },

  // `req` es null cuando lo dispara el job automático (jobs/syncScheduler.js).
  async runBackup(req, deviceId) {
    const all = await netbackupRepository.listDevices();
    const device = all.find((d) => d.id === deviceId);
    if (!device) throw new NotFoundError('Dispositivo no encontrado');

    const raw = await netbackupRepository.findDeviceById(deviceId);
    const actorId = req?.session?.userId ?? null;
    const trigger = req ? 'manual' : 'scheduled';

    const runId = await netbackupRepository.createRun({ deviceId, trigger, triggeredBy: actorId });

    try {
      const password = decryptSecret(raw.ssh_password_encrypted);
      const output = await fetchDeviceConfig({
        host: device.managementIp,
        port: device.sshPort,
        username: device.sshUsername,
        password,
        command: device.command,
      });

      await netbackupRepository.finishRun(runId, { result: 'success', configOutput: output, configHash: hashConfig(output) });
      await netbackupRepository.updateDevice(deviceId, { last_run_at: new Date() });

      await recordEvent({
        userId: actorId,
        action: 'netbackup.run',
        resource: 'netbackup_device',
        resourceId: deviceId,
        result: 'success',
        req,
        metadata: { device: deviceLabel(device), trigger, configLength: output.length },
      });

      return { runId, configLength: output.length };
    } catch (err) {
      await netbackupRepository.finishRun(runId, { result: 'failure', errorMessage: err.message });

      await recordEvent({
        userId: actorId,
        action: 'netbackup.run',
        resource: 'netbackup_device',
        resourceId: deviceId,
        result: 'failure',
        req,
        metadata: { device: deviceLabel(device), trigger, error: err.message },
      });

      throw err;
    }
  },

  listRuns() {
    return netbackupRepository.listRuns();
  },

  async getRunConfig(id) {
    const run = await netbackupRepository.findRunById(id);
    if (!run || run.result !== 'success' || !run.configOutput) {
      throw new NotFoundError('No hay una configuración guardada para esa corrida');
    }
    return run;
  },

  // Página Bitácora: por dispositivo, cuántas corridas exitosas y
  // cuántas configuraciones DISTINTAS hay entre ellas.
  async getConfigSummary() {
    const rows = await netbackupRepository.configSummaryByDevice();
    return rows.map((r) => ({
      id: r.id,
      hardwareBrand: r.hardwareBrand,
      hardwareModel: r.hardwareModel,
      lastRunAt: r.lastRunAt,
      totalRuns: Number(r.totalRuns),
      uniqueConfigs: Number(r.uniqueConfigs),
    }));
  },

  // Versiones (corridas exitosas) de un dispositivo, con
  // `changedFromPrevious` marcando si el hash difiere del anterior en
  // el tiempo — la primera versión conocida cuenta como "cambio"
  // (no hay nada previo con qué compararla).
  async listDeviceVersions(deviceId) {
    const device = await netbackupRepository.findDeviceById(deviceId);
    if (!device) throw new NotFoundError('Dispositivo no encontrado');

    const runs = await netbackupRepository.listSuccessfulRunsForDevice(deviceId);
    let previousHash = null;
    const withDiff = runs.map((r) => {
      const changedFromPrevious = r.configHash !== previousHash;
      previousHash = r.configHash;
      return { id: r.id, startedAt: r.startedAt, changedFromPrevious };
    });
    return withDiff.reverse(); // más nueva primero, para mostrar en la tabla
  },

  // Diferencia línea por línea entre dos corridas exitosas del MISMO
  // dispositivo (usa `diff` — diffLines, algoritmo LCS estándar).
  async diffRuns(fromRunId, toRunId) {
    const [fromRun, toRun] = await Promise.all([
      netbackupRepository.findRunById(fromRunId),
      netbackupRepository.findRunById(toRunId),
    ]);
    if (!fromRun || !toRun) throw new NotFoundError('Alguna de las corridas seleccionadas no existe');
    if (fromRun.deviceId !== toRun.deviceId) throw new ValidationError('Las dos corridas deben ser del mismo dispositivo');
    if (fromRun.result !== 'success' || toRun.result !== 'success') {
      throw new ValidationError('Solo se pueden comparar corridas exitosas (con configuración guardada)');
    }

    const parts = diffLines(fromRun.configOutput, toRun.configOutput);
    return {
      fromStartedAt: fromRun.startedAt,
      toStartedAt: toRun.startedAt,
      parts: parts.map((p) => ({ value: p.value, added: Boolean(p.added), removed: Boolean(p.removed) })),
    };
  },
};
