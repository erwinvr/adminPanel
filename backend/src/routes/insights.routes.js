import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import * as insightsController from '../controllers/insights.controller.js';

const router = Router();

router.use(authenticate);

router.get('/user-security', requirePermission(PERMISSIONS.INSIGHTS_VIEW), asyncHandler(insightsController.getUserSecurityInsights));

export default router;
