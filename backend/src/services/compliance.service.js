/**
 * services/compliance.service.js
 *
 * Compliance de "Backup Networking": reglas de texto/regex evaluadas
 * contra la config completa (`netbackup_runs.config_output`) — es lo
 * único que los 3 drivers tienen en común (raw_ssh, napalm_ios,
 * fortios_api no comparten ningún dato estructurado uniforme).
 *
 * `compliance_results` guarda SOLO el estado actual (upsert por par
 * regla×dispositivo, ver la migración) — se recalcula en dos momentos:
 *  1. Automáticamente al final de cada backup exitoso (`evaluateDevice`,
 *     llamado desde netbackup.service.js#runBackup).
 *  2. Al crear o editar una regla (`evaluateRuleAcrossDevices`), contra
 *     la ÚLTIMA corrida exitosa de cada dispositivo aplicable — así el
 *     estado de compliance no espera al próximo backup para reflejar
 *     una regla nueva.
 * En ambos casos se limpian los resultados que dejaron de aplicar
 * (regla desactivada, driver cambiado) para no dejar resultados
 * "fantasma".
 */

import { complianceRepository } from '../repositories/compliance.repository.js';
import { netbackupRepository } from '../repositories/netbackup.repository.js';
import { recordEvent } from '../audit/audit.service.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertValidPattern(mode, pattern) {
  if (mode !== 'regex') return;
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
  } catch (err) {
    throw new ValidationError(`El patrón no es una expresión regular válida: ${err.message}`);
  }
}

// Evalúa UNA regla contra un texto de config — texto e regex comparten
// el mismo camino (texto literal se escapa a regex), así ambos modos
// devuelven el mismo tipo de "línea que matcheó" como contexto.
function evaluateRule(rule, configText) {
  const flags = rule.caseSensitive ? '' : 'i';
  const source = rule.mode === 'regex' ? rule.pattern : escapeRegExp(rule.pattern);
  const regex = new RegExp(source, flags);

  const matchLine = configText.split('\n').find((line) => regex.test(line));
  const matched = Boolean(matchLine);
  const passed = rule.matchType === 'must_contain' ? matched : !matched;

  return { passed, matchedSnippet: matchLine ? matchLine.trim().slice(0, 300) : null };
}

function ruleAppliesToDriver(rule, driver) {
  return !rule.driver || rule.driver === driver;
}

// Cola común de createRule/updateRule: auditar el escrito, releer la
// regla ya guardada, y re-evaluarla contra el estado actual de los
// dispositivos a los que aplica — lo único que cambia entre alta y
// edición es la acción/metadata del evento de auditoría.
async function finalizeRuleWrite({ req, actorId, id, action, metadata }) {
  await recordEvent({
    userId: actorId,
    action,
    resource: 'compliance_rule',
    resourceId: id,
    result: 'success',
    req,
    metadata,
  });

  const rule = await complianceRepository.findRuleById(id);
  await complianceService.evaluateRuleAcrossDevices(rule);
  return rule;
}

export const complianceService = {
  listRules() {
    return complianceRepository.listRules();
  },

  async createRule(req, data) {
    assertValidPattern(data.mode, data.pattern);

    const actorId = req.session.userId;
    const id = await complianceRepository.createRule({
      name: data.name,
      description: data.description || null,
      driver: data.driver ?? null,
      mode: data.mode,
      match_type: data.matchType,
      pattern: data.pattern,
      case_sensitive: data.caseSensitive,
      severity: data.severity,
      active: data.active,
      created_by: actorId,
      updated_by: actorId,
    });

    return finalizeRuleWrite({
      req,
      actorId,
      id,
      action: 'netbackup.compliance.rule_create',
      metadata: { name: data.name, driver: data.driver, mode: data.mode },
    });
  },

  async updateRule(req, id, changes) {
    const existing = await complianceRepository.findRuleById(id);
    if (!existing) throw new NotFoundError('Regla no encontrada');

    const effectiveMode = changes.mode ?? existing.mode;
    const effectivePattern = changes.pattern ?? existing.pattern;
    assertValidPattern(effectiveMode, effectivePattern);

    const actorId = req.session.userId;
    const dbChanges = { updated_by: actorId };
    if (changes.name !== undefined) dbChanges.name = changes.name;
    if (changes.description !== undefined) dbChanges.description = changes.description || null;
    if (changes.driver !== undefined) dbChanges.driver = changes.driver;
    if (changes.mode !== undefined) dbChanges.mode = changes.mode;
    if (changes.matchType !== undefined) dbChanges.match_type = changes.matchType;
    if (changes.pattern !== undefined) dbChanges.pattern = changes.pattern;
    if (changes.caseSensitive !== undefined) dbChanges.case_sensitive = changes.caseSensitive;
    if (changes.severity !== undefined) dbChanges.severity = changes.severity;
    if (changes.active !== undefined) dbChanges.active = changes.active;

    await complianceRepository.updateRule(id, dbChanges);

    return finalizeRuleWrite({
      req,
      actorId,
      id,
      action: 'netbackup.compliance.rule_update',
      metadata: { changes: Object.keys(changes) },
    });
  },

  async deleteRule(req, id) {
    const existing = await complianceRepository.findRuleById(id);
    if (!existing) throw new NotFoundError('Regla no encontrada');

    const actorId = req.session.userId;
    await complianceRepository.deleteRule(id); // ON DELETE CASCADE limpia compliance_results solo

    await recordEvent({
      userId: actorId,
      action: 'netbackup.compliance.rule_delete',
      resource: 'compliance_rule',
      resourceId: id,
      result: 'success',
      req,
      metadata: { name: existing.name },
    });
  },

  // Se llama al crear/editar una regla — la evalúa contra la última
  // corrida exitosa de cada dispositivo al que aplica (sin esperar al
  // próximo backup), y limpia resultados de dispositivos a los que
  // dejó de aplicarle (ej. se le cambió el driver a la regla).
  async evaluateRuleAcrossDevices(rule) {
    const devices = await netbackupRepository.listDevices();
    const applicableDevices = rule.active ? devices.filter((d) => ruleAppliesToDriver(rule, d.driver)) : [];

    // La última corrida de cada dispositivo se trae en paralelo (son
    // consultas independientes); el cómputo de evaluateRule() es en
    // memoria, así que se junta todo antes de escribir UNA sola vez.
    const lastRuns = await Promise.all(
      applicableDevices.map((device) => netbackupRepository.findLatestSuccessfulRunForDevice(device.id))
    );

    const results = [];
    applicableDevices.forEach((device, i) => {
      const lastRun = lastRuns[i];
      if (!lastRun) return; // todavía no hay ningún backup exitoso contra el cual evaluar
      const { passed, matchedSnippet } = evaluateRule(rule, lastRun.configOutput);
      results.push({ ruleId: rule.id, deviceId: device.id, runId: lastRun.id, passed, matchedSnippet });
    });

    await complianceRepository.upsertResults(results);
    await complianceRepository.deleteResultsForRuleExcept(
      rule.id,
      applicableDevices.map((d) => d.id)
    );
  },

  // Se llama desde netbackup.service.js#runBackup tras un backup
  // exitoso — evalúa TODAS las reglas activas aplicables al driver de
  // este dispositivo contra la config recién bajada, y limpia
  // resultados de reglas que ya no le aplican.
  async evaluateDevice(req, device, configText, runId) {
    const rules = await complianceRepository.listActiveRulesForDriver(device.driver);

    const results = rules.map((rule) => ({ ruleId: rule.id, deviceId: device.id, runId, ...evaluateRule(rule, configText) }));
    const passedCount = results.filter((r) => r.passed).length;

    await complianceRepository.upsertResults(results);
    await complianceRepository.deleteResultsForDeviceExceptRules(
      device.id,
      rules.map((r) => r.id)
    );

    if (rules.length > 0) {
      await recordEvent({
        userId: req?.session?.userId ?? null,
        action: 'netbackup.compliance.evaluated',
        resource: 'netbackup_device',
        resourceId: device.id,
        result: 'success',
        req,
        metadata: { totalRules: rules.length, passed: passedCount, failed: rules.length - passedCount },
      });
    }
  },

  async getSummary() {
    const rows = await complianceRepository.summaryByDevice();
    return rows.map((r) => ({
      id: r.id,
      hardwareBrand: r.hardwareBrand,
      hardwareModel: r.hardwareModel,
      totalRules: Number(r.totalRules),
      passedRules: Number(r.passedRules),
      failedRules: Number(r.failedRules),
      worstSeverity: r.worstSeverity ?? null,
    }));
  },

  async getDeviceResults(deviceId) {
    const device = await netbackupRepository.findDeviceById(deviceId);
    if (!device) throw new NotFoundError('Dispositivo no encontrado');
    return complianceRepository.resultsForDevice(deviceId);
  },
};
