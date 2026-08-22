import Joi from 'joi';

export const createNodeSchema = Joi.object({
  columnIndex: Joi.number().integer().min(0).max(4).required(),
  name: Joi.string().trim().min(1).max(200).required(),
  sub: Joi.string().trim().max(300).allow('').optional(),
  color: Joi.string()
    .trim()
    .pattern(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .messages({ 'string.pattern.base': 'El color debe ser un hex de 6 dígitos, ej. #e5484d' }),
});

export const updateNodeSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200),
  sub: Joi.string().trim().max(300).allow(''),
  color: Joi.string()
    .trim()
    .pattern(/^#[0-9a-fA-F]{6}$/)
    .allow(null, ''),
}).min(1);

export const createEdgeSchema = Joi.object({
  fromNodeId: Joi.string().uuid().required(),
  toNodeId: Joi.string().uuid().required(),
});
