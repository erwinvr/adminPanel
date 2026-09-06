import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import * as networkTopologyController from '../controllers/networkTopology.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.NETWORK_TOPOLOGY_VIEW), asyncHandler(networkTopologyController.getGraph));

export default router;
