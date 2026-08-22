import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { createNodeSchema, updateNodeSchema, createEdgeSchema } from '../validators/topology.validator.js';
import * as topologyController from '../controllers/topology.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.TOPOLOGY_VIEW), asyncHandler(topologyController.getGraph));

router.post(
  '/nodes',
  requirePermission(PERMISSIONS.TOPOLOGY_EDIT),
  validateBody(createNodeSchema),
  asyncHandler(topologyController.createNode)
);
router.patch(
  '/nodes/:id',
  requirePermission(PERMISSIONS.TOPOLOGY_EDIT),
  validateBody(updateNodeSchema),
  asyncHandler(topologyController.updateNode)
);
router.delete('/nodes/:id', requirePermission(PERMISSIONS.TOPOLOGY_EDIT), asyncHandler(topologyController.deleteNode));

router.post(
  '/edges',
  requirePermission(PERMISSIONS.TOPOLOGY_EDIT),
  validateBody(createEdgeSchema),
  asyncHandler(topologyController.createEdge)
);
router.delete('/edges/:id', requirePermission(PERMISSIONS.TOPOLOGY_EDIT), asyncHandler(topologyController.deleteEdge));

export default router;
