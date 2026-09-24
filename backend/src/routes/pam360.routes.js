import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { saveSettingsSchema, listAccessRequestsQuerySchema } from '../validators/pam360.validator.js';
import * as pam360Controller from '../controllers/pam360.controller.js';

const router = Router();

router.use(authenticate);

router.get('/settings', requirePermission(PERMISSIONS.PAM360_EDIT), asyncHandler(pam360Controller.getSettings));

router.patch(
  '/settings',
  requirePermission(PERMISSIONS.PAM360_EDIT),
  validateBody(saveSettingsSchema),
  asyncHandler(pam360Controller.saveSettings)
);

router.post('/sync', requirePermission(PERMISSIONS.PAM360_EDIT), asyncHandler(pam360Controller.sync));

router.get(
  '/access-requests',
  requirePermission(PERMISSIONS.PAM360_VIEW),
  validateQuery(listAccessRequestsQuerySchema),
  asyncHandler(pam360Controller.listAccessRequests)
);

export default router;
