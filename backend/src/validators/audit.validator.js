import Joi from 'joi';
import { AUDIT_MODULES } from '../audit/auditModules.js';
import { paginationSchema } from './pagination.js';

export const listAuditLogsQuerySchema = Joi.object({
  ...paginationSchema,
  userId: Joi.string().uuid().optional(),
  // Módulo cuyos eventos se listan; por defecto 'application' (todo lo
  // que no pertenece a una integración — ver audit.repository.js).
  module: Joi.string()
    .valid(...Object.keys(AUDIT_MODULES))
    .default('application'),
  action: Joi.string().max(100).optional(),
  resource: Joi.string().max(100).optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
});
