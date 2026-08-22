import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import * as permissionController from '../controllers/permission.controller.js';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.PERMISSIONS_VIEW),
  asyncHandler(permissionController.listPermissions)
);

export default router;
