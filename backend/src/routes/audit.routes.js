import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateQuery } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { listAuditLogsQuerySchema } from '../validators/audit.validator.js';
import * as auditController from '../controllers/audit.controller.js';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.AUDIT_VIEW),
  validateQuery(listAuditLogsQuerySchema),
  asyncHandler(auditController.listAuditLogs)
);

export default router;
