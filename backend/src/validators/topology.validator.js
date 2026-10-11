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
  // Solo tiene sentido para Servidor/Instancia (columnIndex 3) — el
  // formulario la oculta para el resto, pero igual se valida acá como una
  // IP válida si se manda.
  ipAddress: Joi.string().ip().allow('', null).optional(),
});

export const updateNodeSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200),
  sub: Joi.string().trim().max(300).allow(''),
  color: Joi.string()
    .trim()
    .pattern(/^#[0-9a-fA-F]{6}$/)
    .allow(null, ''),
  ipAddress: Joi.string().ip().allow('', null),
}).min(1);

export const createEdgeSchema = Joi.object({
  fromNodeId: Joi.string().uuid().required(),
  toNodeId: Joi.string().uuid().required(),
});

export const updateEdgeSchema = Joi.object({
  fromNodeId: Joi.string().uuid(),
  toNodeId: Joi.string().uuid(),
}).min(1);
