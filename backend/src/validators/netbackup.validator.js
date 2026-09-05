import Joi from 'joi';

export const createDeviceSchema = Joi.object({
  hardwareId: Joi.string().uuid().required(),
  sshPort: Joi.number().integer().min(1).max(65535).default(22),
  sshUsername: Joi.string().trim().min(1).max(200).required(),
  sshPassword: Joi.string().min(1).max(500).required(),
  command: Joi.string().trim().min(1).max(300).default('/export'),
  syncIntervalMinutes: Joi.number().integer().min(0).allow(null).optional(),
});

// hardwareId no se puede cambiar en edición — retargetear un
// dispositivo a otro hardware es más claro borrando y creando de
// nuevo (mismo criterio que la Bóveda de contraseñas).
export const updateDeviceSchema = Joi.object({
  sshPort: Joi.number().integer().min(1).max(65535),
  sshUsername: Joi.string().trim().min(1).max(200),
  // Vacío u omitido = mantener la contraseña ya guardada.
  sshPassword: Joi.string().min(1).max(500).allow(''),
  command: Joi.string().trim().min(1).max(300),
  syncIntervalMinutes: Joi.number().integer().min(0).allow(null),
}).min(1);

export const diffQuerySchema = Joi.object({
  from: Joi.string().uuid().required(),
  to: Joi.string().uuid().required(),
});
