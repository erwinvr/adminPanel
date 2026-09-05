import Joi from 'joi';

export const saveSettingsSchema = Joi.object({
  host: Joi.string().trim().min(1).max(255).required(),
  port: Joi.number().integer().min(1).max(65535).required(),
  secure: Joi.boolean().required(),
  username: Joi.string().trim().max(255).allow('').optional(),
  // Vacío u omitido = mantener la contraseña ya guardada (mismo
  // criterio que el resto de las integraciones).
  password: Joi.string().max(500).allow('').optional(),
  fromEmail: Joi.string().trim().email().required(),
  fromName: Joi.string().trim().max(200).allow('').optional(),
});

export const sendTestEmailSchema = Joi.object({
  to: Joi.string().trim().email().required(),
});
