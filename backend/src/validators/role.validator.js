import Joi from 'joi';

export const createRoleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  description: Joi.string().trim().max(500).allow('').optional(),
  permissionIds: Joi.array().items(Joi.string().uuid()).default([]),
});

export const updateRoleSchema = Joi.object({
  description: Joi.string().trim().max(500).allow('').optional(),
  permissionIds: Joi.array().items(Joi.string().uuid()).optional(),
}).min(1);
