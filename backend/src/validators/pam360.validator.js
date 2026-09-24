import Joi from 'joi';

export const saveSettingsSchema = Joi.object({
  baseUrl: Joi.string().trim().uri().max(255).required(),
  verifyTls: Joi.boolean().required(),
  // Zona horaria IANA del servidor de PAM360 (ej. America/La_Paz) — ver
  // migración 20260101003300.
  timezone: Joi.string()
    .trim()
    .max(64)
    .required()
    .custom((value, helpers) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return value;
      } catch {
        return helpers.error('any.invalid');
      }
    })
    .messages({ 'any.invalid': 'Zona horaria inválida (usá un nombre IANA, ej. America/La_Paz o UTC)' }),
  // Minutos entre sincronizaciones automáticas — 0/null desactiva el job
  // en segundo plano (ver syncScheduler.js).
  syncIntervalMinutes: Joi.number().integer().min(0).allow(null).optional(),
  // Vacío u omitido = mantener el AUTHTOKEN ya guardado (mismo criterio
  // que el resto de los secretos de integraciones — ver ad.validator.js).
  authToken: Joi.string().trim().min(1).max(500).allow('').optional(),
});

export const listAccessRequestsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().max(300).optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
});
