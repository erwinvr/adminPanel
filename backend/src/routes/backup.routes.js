import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { saveSettingsSchema } from '../validators/backup.validator.js';
import * as backupController from '../controllers/backup.controller.js';

const router = Router();

router.use(authenticate);

router.get('/settings', requirePermission(PERMISSIONS.BACKUPS_EDIT), asyncHandler(backupController.getSettings));

router.patch(
  '/settings',
  requirePermission(PERMISSIONS.BACKUPS_EDIT),
  validateBody(saveSettingsSchema),
  asyncHandler(backupController.saveSettings)
);

router.post('/sync', requirePermission(PERMISSIONS.BACKUPS_EDIT), asyncHandler(backupController.sync));

router.get('/dashboard', requirePermission(PERMISSIONS.BACKUPS_VIEW), asyncHandler(backupController.getDashboard));

export default router;
