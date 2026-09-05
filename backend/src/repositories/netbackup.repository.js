import { db } from '../config/database.js';

// Nunca incluye ssh_password_encrypted — igual que vault_credentials,
// el secreto solo sale cifrado y de acá no sale nunca en texto plano.
const DEVICE_COLUMNS = [
  'd.id',
  'd.hardware_id as hardwareId',
  'h.brand as hardwareBrand',
  'h.model as hardwareModel',
  'h.management_ip as managementIp',
  'd.ssh_port as sshPort',
  'd.ssh_username as sshUsername',
  'd.ssh_password_preview as sshPasswordPreview',
  'd.command',
  'd.sync_interval_minutes as syncIntervalMinutes',
  'd.last_run_at as lastRunAt',
];

const RUN_COLUMNS = [
  'r.id',
  'r.device_id as deviceId',
  'h.brand as hardwareBrand',
  'h.model as hardwareModel',
  'r.started_at as startedAt',
  'r.finished_at as finishedAt',
  'r.result',
  'r.error_message as errorMessage',
  'r.trigger',
];

export const netbackupRepository = {
  listDevices() {
    return db('netbackup_devices as d')
      .join('hardware_inventory as h', 'h.id', 'd.hardware_id')
      .select(DEVICE_COLUMNS)
      .orderBy(['h.brand', 'h.model']);
  },

  findDeviceById(id) {
    return db('netbackup_devices').where({ id }).first();
  },

  // Solo lo necesario para que el scheduler decida a quién le toca
  // correr — a diferencia de listDevices(), sin el join a hardware.
  listSchedulableDevices() {
    return db('netbackup_devices').select('id', 'sync_interval_minutes', 'last_run_at');
  },

  findDeviceByHardwareId(hardwareId) {
    return db('netbackup_devices').where({ hardware_id: hardwareId }).first();
  },

  async createDevice(data) {
    const [row] = await db('netbackup_devices').insert(data).returning('id');
    return row.id;
  },

  updateDevice(id, changes) {
    return db('netbackup_devices')
      .where({ id })
      .update({ ...changes, updated_at: db.fn.now() });
  },

  deleteDevice(id) {
    return db('netbackup_devices').where({ id }).del();
  },

  // IDs de hardware de tipo 'networking' con IP de administración
  // cargada y que TODAVÍA no tienen un dispositivo de backup
  // configurado — son las únicas opciones válidas para "+ Nuevo
  // dispositivo" (un hardware ya configurado no puede volver a elegirse,
  // el índice único de la migración lo rechazaría igual).
  listAvailableHardware() {
    return db('hardware_inventory as h')
      .leftJoin('netbackup_devices as d', 'd.hardware_id', 'h.id')
      .where('h.type', 'networking')
      .whereNotNull('h.management_ip')
      .whereNull('d.id')
      .select('h.id', 'h.brand', 'h.model', 'h.management_ip as managementIp')
      .orderBy(['h.brand', 'h.model']);
  },

  createRun({ deviceId, trigger, triggeredBy }) {
    return db('netbackup_runs')
      .insert({ device_id: deviceId, trigger, triggered_by: triggeredBy, result: 'failure' }) // arranca en 'failure', se corrige a 'success' si termina bien
      .returning('id')
      .then(([row]) => row.id);
  },

  finishRun(id, { result, errorMessage, configOutput, configHash }) {
    return db('netbackup_runs').where({ id }).update({
      result,
      error_message: errorMessage ?? null,
      config_output: configOutput ?? null,
      config_hash: configHash ?? null,
      finished_at: db.fn.now(),
    });
  },

  listRuns({ limit = 100 } = {}) {
    return db('netbackup_runs as r')
      .join('netbackup_devices as d', 'd.id', 'r.device_id')
      .join('hardware_inventory as h', 'h.id', 'd.hardware_id')
      .select(RUN_COLUMNS)
      .orderBy('r.started_at', 'desc')
      .limit(limit);
  },

  findRunById(id) {
    return db('netbackup_runs as r')
      .join('netbackup_devices as d', 'd.id', 'r.device_id')
      .join('hardware_inventory as h', 'h.id', 'd.hardware_id')
      .select([...RUN_COLUMNS, 'r.config_output as configOutput'])
      .where('r.id', id)
      .first();
  },

  // Por dispositivo: cuántas corridas exitosas tiene y cuántas
  // CONFIGURACIONES DISTINTAS hay entre ellas (mismo hash = misma
  // config, no importa cuántas veces se repitió) — la base de la
  // página Bitácora. LEFT JOIN para que un dispositivo sin corridas
  // todavía también aparezca, con 0/0.
  configSummaryByDevice() {
    return db('netbackup_devices as d')
      .join('hardware_inventory as h', 'h.id', 'd.hardware_id')
      .leftJoin('netbackup_runs as r', function () {
        this.on('r.device_id', '=', 'd.id').andOn('r.result', '=', db.raw("'success'"));
      })
      .groupBy(['d.id', 'h.brand', 'h.model'])
      .select(
        'd.id',
        'h.brand as hardwareBrand',
        'h.model as hardwareModel',
        'd.last_run_at as lastRunAt',
        db.raw('count(r.id) as "totalRuns"'),
        db.raw('count(distinct r.config_hash) as "uniqueConfigs"')
      )
      .orderBy(['h.brand', 'h.model']);
  },

  // Corridas exitosas de un dispositivo, más viejas primero — así el
  // service puede comparar cada una con la anterior y marcar si cambió.
  listSuccessfulRunsForDevice(deviceId) {
    return db('netbackup_runs')
      .where({ device_id: deviceId, result: 'success' })
      .select('id', 'started_at as startedAt', 'config_hash as configHash')
      .orderBy('started_at', 'asc');
  },
};
