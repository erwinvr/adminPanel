import Joi from 'joi';

const TYPES = ['servidor', 'networking', 'energia'];

export const createInventoryItemSchema = Joi.object({
  type: Joi.string()
    .valid(...TYPES)
    .required(),
  brand: Joi.string().trim().min(1).max(150).required(),
  model: Joi.string().trim().min(1).max(150).required(),
  officeId: Joi.string().uuid().required(),
  hasSupport: Joi.boolean().required(),
  supportUntil: Joi.date().iso().allow(null).optional(),
  supportProviderId: Joi.string().uuid().allow(null).optional(),
  managementIp: Joi.string().ip().allow('', null).optional(),
});

export const updateInventoryItemSchema = Joi.object({
  type: Joi.string().valid(...TYPES),
  brand: Joi.string().trim().min(1).max(150),
  model: Joi.string().trim().min(1).max(150),
  officeId: Joi.string().uuid(),
  hasSupport: Joi.boolean(),
  supportUntil: Joi.date().iso().allow(null),
  supportProviderId: Joi.string().uuid().allow(null),
  managementIp: Joi.string().ip().allow('', null),
}).min(1);
