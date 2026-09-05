import Joi from 'joi';

export const saveSettingsSchema = Joi.object({
  tenantId: Joi.string().trim().min(1).max(200).required(),
  clientId: Joi.string().trim().uuid().required(),
  // Vacío u omitido = mantener el client secret ya guardado (así no hay
  // que volver a pegarlo cada vez que se cambia solo el tenant/client ID).
  clientSecret: Joi.string().trim().min(1).max(500).allow('').optional(),
  // Minutos entre sincronizaciones automáticas — 0/null desactiva el
  // job en segundo plano para esta integración (ver syncScheduler.js).
  syncIntervalMinutes: Joi.number().integer().min(0).allow(null).optional(),
});
