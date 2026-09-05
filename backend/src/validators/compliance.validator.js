import Joi from 'joi';

const DRIVERS = ['raw_ssh', 'napalm_ios', 'fortios_api'];
const MODES = ['text', 'regex'];
const MATCH_TYPES = ['must_contain', 'must_not_contain'];
const SEVERITIES = ['info', 'warning', 'critical'];

// Que la regex compile se valida en el service (compliance.service.js),
// no acá — ahí se tiene siempre la regla COMPLETA (mode + pattern ya
// fusionados con lo existente en una edición parcial), mientras que acá
// en una edición parcial "pattern" puede llegar sin "mode" en el mismo
// payload.
const baseFields = {
  name: Joi.string().trim().min(1).max(200),
  description: Joi.string().trim().max(2000).allow('', null),
  driver: Joi.string().valid(...DRIVERS).allow(null),
  mode: Joi.string().valid(...MODES),
  matchType: Joi.string().valid(...MATCH_TYPES),
  pattern: Joi.string().min(1).max(1000),
  caseSensitive: Joi.boolean(),
  severity: Joi.string().valid(...SEVERITIES),
  active: Joi.boolean(),
};

export const createRuleSchema = Joi.object({
  name: baseFields.name.required(),
  description: baseFields.description,
  driver: baseFields.driver.default(null),
  mode: baseFields.mode.default('text'),
  matchType: baseFields.matchType.required(),
  pattern: baseFields.pattern.required(),
  caseSensitive: baseFields.caseSensitive.default(false),
  severity: baseFields.severity.default('warning'),
  active: baseFields.active.default(true),
});

export const updateRuleSchema = Joi.object(baseFields).min(1);
