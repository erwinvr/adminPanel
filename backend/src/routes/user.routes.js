import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { createUserSchema, updateUserSchema, listUsersQuerySchema } from '../validators/user.validator.js';
import * as userController from '../controllers/user.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.USERS_VIEW), validateQuery(listUsersQuerySchema), asyncHandler(userController.listUsers));
router.get('/:id', requirePermission(PERMISSIONS.USERS_VIEW), asyncHandler(userController.getUser));
router.post('/', requirePermission(PERMISSIONS.USERS_CREATE), validateBody(createUserSchema), asyncHandler(userController.createUser));
router.patch('/:id', requirePermission(PERMISSIONS.USERS_UPDATE), validateBody(updateUserSchema), asyncHandler(userController.updateUser));
router.delete('/:id', requirePermission(PERMISSIONS.USERS_DELETE), asyncHandler(userController.deactivateUser));

export default router;
