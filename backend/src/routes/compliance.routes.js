import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { createRuleSchema, updateRuleSchema } from '../validators/compliance.validator.js';
import * as complianceController from '../controllers/compliance.controller.js';

const router = Router();

router.use(authenticate);

// Mismos permisos que el resto de "Backup Networking" — compliance es
// parte de la misma sección, no una responsabilidad separada.
router.get('/rules', requirePermission(PERMISSIONS.NETBACKUP_EDIT), asyncHandler(complianceController.listRules));

router.post(
  '/rules',
  requirePermission(PERMISSIONS.NETBACKUP_EDIT),
  validateBody(createRuleSchema),
  asyncHandler(complianceController.createRule)
);

router.patch(
  '/rules/:id',
  requirePermission(PERMISSIONS.NETBACKUP_EDIT),
  validateBody(updateRuleSchema),
  asyncHandler(complianceController.updateRule)
);

router.delete('/rules/:id', requirePermission(PERMISSIONS.NETBACKUP_EDIT), asyncHandler(complianceController.deleteRule));

router.get('/summary', requirePermission(PERMISSIONS.NETBACKUP_VIEW), asyncHandler(complianceController.getSummary));

router.get(
  '/devices/:id',
  requirePermission(PERMISSIONS.NETBACKUP_VIEW),
  asyncHandler(complianceController.getDeviceResults)
);

export default router;
