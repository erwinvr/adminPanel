import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { createOfficeSchema, updateOfficeSchema } from '../validators/office.validator.js';
import * as officeController from '../controllers/office.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.OFFICES_VIEW), asyncHandler(officeController.listOffices));

router.post(
  '/',
  requirePermission(PERMISSIONS.OFFICES_EDIT),
  validateBody(createOfficeSchema),
  asyncHandler(officeController.createOffice)
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.OFFICES_EDIT),
  validateBody(updateOfficeSchema),
  asyncHandler(officeController.updateOffice)
);

router.delete('/:id', requirePermission(PERMISSIONS.OFFICES_EDIT), asyncHandler(officeController.deleteOffice));

export default router;
