import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { createProviderSchema, updateProviderSchema, setResourcesSchema } from '../validators/provider.validator.js';
import * as providerController from '../controllers/provider.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.PROVIDERS_VIEW), asyncHandler(providerController.listProviders));

router.post(
  '/',
  requirePermission(PERMISSIONS.PROVIDERS_EDIT),
  validateBody(createProviderSchema),
  asyncHandler(providerController.createProvider)
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.PROVIDERS_EDIT),
  validateBody(updateProviderSchema),
  asyncHandler(providerController.updateProvider)
);

router.delete('/:id', requirePermission(PERMISSIONS.PROVIDERS_EDIT), asyncHandler(providerController.deleteProvider));

router.patch(
  '/:id/resources',
  requirePermission(PERMISSIONS.PROVIDERS_EDIT),
  validateBody(setResourcesSchema),
  asyncHandler(providerController.setResources)
);

export default router;
