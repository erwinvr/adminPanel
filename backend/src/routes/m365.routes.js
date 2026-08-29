import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { saveSettingsSchema } from '../validators/m365.validator.js';
import * as m365Controller from '../controllers/m365.controller.js';

const router = Router();

router.use(authenticate);

router.get('/settings', requirePermission(PERMISSIONS.M365_EDIT), asyncHandler(m365Controller.getSettings));

router.patch(
  '/settings',
  requirePermission(PERMISSIONS.M365_EDIT),
  validateBody(saveSettingsSchema),
  asyncHandler(m365Controller.saveSettings)
);

router.post('/sync', requirePermission(PERMISSIONS.M365_EDIT), asyncHandler(m365Controller.sync));

router.get('/licenses', requirePermission(PERMISSIONS.M365_VIEW), asyncHandler(m365Controller.listLicenses));

router.get('/users', requirePermission(PERMISSIONS.M365_VIEW), asyncHandler(m365Controller.listUsers));

export default router;
