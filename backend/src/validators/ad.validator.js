import Joi from 'joi';

export const saveSettingsSchema = Joi.object({
  host: Joi.string().trim().min(1).max(255).required(),
  port: Joi.number().integer().min(1).max(65535).required(),
  useTls: Joi.boolean().required(),
  bindDn: Joi.string().trim().min(1).max(500).required(),
  // Vacío u omitido = mantener la contraseña ya guardada (mismo criterio
  // que el client secret de M365 — ver m365.validator.js).
  bindPassword: Joi.string().trim().min(1).max(500).allow('').optional(),
  baseDn: Joi.string().trim().min(1).max(500).required(),
  // Minutos entre sincronizaciones automáticas — 0/null desactiva el
  // job en segundo plano para esta integración (ver syncScheduler.js).
  syncIntervalMinutes: Joi.number().integer().min(0).allow(null).optional(),
});
