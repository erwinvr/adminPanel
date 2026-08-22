import Joi from 'joi';

export const listAuditLogsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  userId: Joi.string().uuid().optional(),
  action: Joi.string().max(100).optional(),
  resource: Joi.string().max(100).optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
});
