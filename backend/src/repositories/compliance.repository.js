import { db } from '../config/database.js';

const RULE_COLUMNS = [
  'id',
  'name',
  'description',
  'driver',
  'mode',
  'match_type as matchType',
  'pattern',
  'case_sensitive as caseSensitive',
  'severity',
  'active',
];

export const complianceRepository = {
  listRules() {
    return db('compliance_rules').select(RULE_COLUMNS).orderBy('name');
  },

  // Reglas aplicables a un dispositivo con un driver dado: las
  // globales (driver IS NULL) + las específicas de ese driver.
  listActiveRulesForDriver(driver) {
    return db('compliance_rules')
      .select(RULE_COLUMNS)
      .where('active', true)
      .andWhere((qb) => qb.whereNull('driver').orWhere('driver', driver));
  },

  findRuleById(id) {
    return db('compliance_rules').select(RULE_COLUMNS).where({ id }).first();
  },

  async createRule(data) {
    const [row] = await db('compliance_rules').insert(data).returning('id');
    return row.id;
  },

  updateRule(id, changes) {
    return db('compliance_rules')
      .where({ id })
      .update({ ...changes, updated_at: db.fn.now() });
  },

  deleteRule(id) {
    return db('compliance_rules').where({ id }).del();
  },

  // Upsert en LOTE: solo interesa el estado ACTUAL (rule_id, device_id)
  // es único — cada evaluación nueva pisa la anterior. Recibe todos los
  // resultados ya calculados (evaluateRule es puro cómputo en memoria,
  // no toca la DB) y los escribe en una sola consulta multi-fila en vez
  // de una consulta por dispositivo/regla — evaluateDevice() corre en
  // el hot path de cada backup exitoso, evaluateRuleAcrossDevices() en
  // cada alta/edición de regla.
  upsertResults(rows) {
    if (rows.length === 0) return Promise.resolve();
    return db('compliance_results')
      .insert(
        rows.map(({ ruleId, deviceId, runId, passed, matchedSnippet }) => ({
          rule_id: ruleId,
          device_id: deviceId,
          run_id: runId,
          passed,
          matched_snippet: matchedSnippet ?? null,
          evaluated_at: db.fn.now(),
        }))
      )
      .onConflict(['rule_id', 'device_id'])
      .merge(['run_id', 'passed', 'matched_snippet', 'evaluated_at']);
  },

  // Borra los resultados de reglas que ya no aplican a un dispositivo
  // (ej. la regla se desactivó, o se cambió a un driver distinto del
  // dispositivo) — evita que quede un resultado "fantasma" de una regla
  // que ya no corresponde evaluar. Se usa desde ambos lados: al
  // guardar una regla (¿a qué dispositivos dejó de aplicarles?) y al
  // evaluar un dispositivo tras un backup (¿qué reglas dejaron de
  // aplicarle a ESTE dispositivo?).
  deleteResultsForRuleExcept(ruleId, deviceIds) {
    const query = db('compliance_results').where({ rule_id: ruleId });
    if (deviceIds.length > 0) query.whereNotIn('device_id', deviceIds);
    return query.del();
  },

  deleteResultsForDeviceExceptRules(deviceId, ruleIds) {
    const query = db('compliance_results').where({ device_id: deviceId });
    if (ruleIds.length > 0) query.whereNotIn('rule_id', ruleIds);
    return query.del();
  },

  // Resumen por dispositivo: cuántas reglas aplicables tiene, cuántas
  // cumple/incumple, y la peor severidad entre las que incumple (para
  // poder pintar el dispositivo en rojo/amarillo en la UI de un
  // vistazo). LEFT JOIN para que un dispositivo sin resultados
  // todavía también aparezca, con 0/0.
  summaryByDevice() {
    return db('netbackup_devices as d')
      .join('hardware_inventory as h', 'h.id', 'd.hardware_id')
      .leftJoin('compliance_results as cr', 'cr.device_id', 'd.id')
      .leftJoin('compliance_rules as r', 'r.id', 'cr.rule_id')
      .groupBy(['d.id', 'h.brand', 'h.model'])
      .select(
        'd.id',
        'h.brand as hardwareBrand',
        'h.model as hardwareModel',
        db.raw('count(cr.id) as "totalRules"'),
        db.raw("count(cr.id) filter (where cr.passed = true) as \"passedRules\""),
        db.raw("count(cr.id) filter (where cr.passed = false) as \"failedRules\""),
        db.raw(
          "(array_agg(r.severity order by case r.severity when 'critical' then 1 when 'warning' then 2 else 3 end) " +
            "filter (where cr.passed = false))[1] as \"worstSeverity\""
        )
      )
      .orderBy(['h.brand', 'h.model']);
  },

  // Detalle regla por regla de un dispositivo, para el drill-down del
  // resumen.
  resultsForDevice(deviceId) {
    return db('compliance_results as cr')
      .join('compliance_rules as r', 'r.id', 'cr.rule_id')
      .where('cr.device_id', deviceId)
      .select(
        'r.id as ruleId',
        'r.name',
        'r.severity',
        'r.match_type as matchType',
        'r.pattern',
        'cr.passed',
        'cr.matched_snippet as matchedSnippet',
        'cr.evaluated_at as evaluatedAt'
      )
      .orderBy(['cr.passed', 'r.severity']);
  },
};
