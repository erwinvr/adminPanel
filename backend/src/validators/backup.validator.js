import Joi from 'joi';

export const saveSettingsSchema = Joi.object({
  baseUrl: Joi.string().trim().uri().max(255).required(),
  username: Joi.string().trim().min(1).max(200).required(),
  // Vacío u omitido = mantener la contraseña ya guardada (mismo criterio
  // que M365/AD — ver m365.validator.js / ad.validator.js).
  password: Joi.string().trim().min(1).max(500).allow('').optional(),
});
