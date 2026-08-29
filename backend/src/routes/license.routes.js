import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { createLicenseSchema, updateLicenseSchema } from '../validators/license.validator.js';
import * as licenseController from '../controllers/license.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.LICENSES_VIEW), asyncHandler(licenseController.listLicenses));

router.post(
  '/',
  requirePermission(PERMISSIONS.LICENSES_EDIT),
  validateBody(createLicenseSchema),
  asyncHandler(licenseController.createLicense)
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.LICENSES_EDIT),
  validateBody(updateLicenseSchema),
  asyncHandler(licenseController.updateLicense)
);

router.delete('/:id', requirePermission(PERMISSIONS.LICENSES_EDIT), asyncHandler(licenseController.deleteLicense));

export default router;
