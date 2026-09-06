import Joi from 'joi';
import { NETBACKUP_DRIVERS, RAW_SSH_DRIVER } from '../integrations/networkBackup/drivers.js';

// 'command' solo aplica al driver 'raw_ssh' (el resto usa NAPALM/API
// REST vía netbackup-agent, sin comando manual) — ver
// backend/src/services/netbackup.service.js#runBackup para el dispatch.

export const createDeviceSchema = Joi.object({
  hardwareId: Joi.string().uuid().required(),
  driver: Joi.string().valid(...NETBACKUP_DRIVERS).default(RAW_SSH_DRIVER),
  port: Joi.number().integer().min(1).max(65535).default(22),
  username: Joi.string().trim().min(1).max(200).required(),
  password: Joi.string().min(1).max(500).required(),
  command: Joi.string().trim().max(300).when('driver', {
    is: RAW_SSH_DRIVER,
    then: Joi.string().trim().min(1).max(300).default('/export'),
    otherwise: Joi.string().trim().max(300).allow('', null).optional(),
  }),
  syncIntervalMinutes: Joi.number().integer().min(0).allow(null).optional(),
});

// hardwareId no se puede cambiar en edición — retargetear un
// dispositivo a otro hardware es más claro borrando y creando de
// nuevo (mismo criterio que la Bóveda de contraseñas).
export const updateDeviceSchema = Joi.object({
  driver: Joi.string().valid(...NETBACKUP_DRIVERS),
  port: Joi.number().integer().min(1).max(65535),
  username: Joi.string().trim().min(1).max(200),
  // Vacío u omitido = mantener la contraseña ya guardada.
  password: Joi.string().min(1).max(500).allow(''),
  command: Joi.string().trim().max(300).when('driver', {
    is: RAW_SSH_DRIVER,
    then: Joi.string().trim().min(1).max(300),
    otherwise: Joi.string().trim().max(300).allow('', null),
  }),
  syncIntervalMinutes: Joi.number().integer().min(0).allow(null),
}).min(1);

export const diffQuerySchema = Joi.object({
  from: Joi.string().uuid().required(),
  to: Joi.string().uuid().required(),
});
