import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { createInventoryItemSchema, updateInventoryItemSchema } from '../validators/inventory.validator.js';
import * as inventoryController from '../controllers/inventory.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.INVENTORY_VIEW), asyncHandler(inventoryController.listInventoryItems));

router.post(
  '/',
  requirePermission(PERMISSIONS.INVENTORY_EDIT),
  validateBody(createInventoryItemSchema),
  asyncHandler(inventoryController.createInventoryItem)
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.INVENTORY_EDIT),
  validateBody(updateInventoryItemSchema),
  asyncHandler(inventoryController.updateInventoryItem)
);

router.delete('/:id', requirePermission(PERMISSIONS.INVENTORY_EDIT), asyncHandler(inventoryController.deleteInventoryItem));

export default router;
