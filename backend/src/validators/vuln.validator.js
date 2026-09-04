import Joi from 'joi';

export const saveSettingsSchema = Joi.object({
  baseUrl: Joi.string().trim().uri().max(255).required(),
  // Vacío u omitido = mantener el API key ya guardado (mismo criterio
  // que el resto de las integraciones — ver m365.validator.js).
  apiKey: Joi.string().trim().min(1).max(500).allow('').optional(),
});
