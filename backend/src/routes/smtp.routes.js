import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { saveSettingsSchema, sendTestEmailSchema } from '../validators/smtp.validator.js';
import * as smtpController from '../controllers/smtp.controller.js';

const router = Router();

router.use(authenticate);
router.use(requirePermission(PERMISSIONS.SMTP_EDIT));

router.get('/settings', asyncHandler(smtpController.getSettings));
router.patch('/settings', validateBody(saveSettingsSchema), asyncHandler(smtpController.saveSettings));
router.post('/test', validateBody(sendTestEmailSchema), asyncHandler(smtpController.sendTestEmail));

export default router;
