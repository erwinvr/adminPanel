import Joi from 'joi';

export const saveSettingsSchema = Joi.object({
  baseUrl: Joi.string().trim().uri().max(255).required(),
  username: Joi.string().trim().min(1).max(200).required(),
  verifyTls: Joi.boolean().required(),
  // Minutos entre sincronizaciones automáticas — 0/null desactiva el job
  // en segundo plano (ver syncScheduler.js).
  syncIntervalMinutes: Joi.number().integer().min(0).allow(null).optional(),
  // Vacío u omitido = mantener la contraseña ya guardada (mismo criterio
  // que M365/AD — ver m365.validator.js / ad.validator.js).
  password: Joi.string().trim().min(1).max(500).allow('').optional(),
});
