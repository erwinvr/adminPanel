import Joi from 'joi';

export const createProviderSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  contactEmail: Joi.string().trim().email({ tlds: false }).max(200).allow('').optional(),
  contactPhone: Joi.string().trim().max(50).allow('').optional(),
  notes: Joi.string().trim().max(300).allow('').optional(),
});

export const updateProviderSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200),
  contactEmail: Joi.string().trim().email({ tlds: false }).max(200).allow(''),
  contactPhone: Joi.string().trim().max(50).allow(''),
  notes: Joi.string().trim().max(300).allow(''),
}).min(1);

export const setResourcesSchema = Joi.object({
  nodeIds: Joi.array().items(Joi.string().uuid()).unique().required(),
});
