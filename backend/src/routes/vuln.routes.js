import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { saveSettingsSchema } from '../validators/vuln.validator.js';
import * as vulnController from '../controllers/vuln.controller.js';

const router = Router();

router.use(authenticate);

router.get('/settings', requirePermission(PERMISSIONS.VULN_EDIT), asyncHandler(vulnController.getSettings));

router.patch(
  '/settings',
  requirePermission(PERMISSIONS.VULN_EDIT),
  validateBody(saveSettingsSchema),
  asyncHandler(vulnController.saveSettings)
);

router.post('/sync', requirePermission(PERMISSIONS.VULN_EDIT), asyncHandler(vulnController.sync));

router.get('/dashboard', requirePermission(PERMISSIONS.VULN_VIEW), asyncHandler(vulnController.getDashboard));

export default router;
