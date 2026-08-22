import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { createRoleSchema, updateRoleSchema } from '../validators/role.validator.js';
import * as roleController from '../controllers/role.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.ROLES_VIEW), asyncHandler(roleController.listRoles));
router.get('/:id', requirePermission(PERMISSIONS.ROLES_VIEW), asyncHandler(roleController.getRole));
router.post('/', requirePermission(PERMISSIONS.ROLES_CREATE), validateBody(createRoleSchema), asyncHandler(roleController.createRole));
router.patch('/:id', requirePermission(PERMISSIONS.ROLES_UPDATE), validateBody(updateRoleSchema), asyncHandler(roleController.updateRole));
router.delete('/:id', requirePermission(PERMISSIONS.ROLES_DELETE), asyncHandler(roleController.deleteRole));

export default router;
