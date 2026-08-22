import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getHealth } from '../controllers/health.controller.js';

const router = Router();

router.get('/health', asyncHandler(getHealth));

export default router;
