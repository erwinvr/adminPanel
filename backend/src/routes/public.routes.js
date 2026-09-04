/**
 * routes/public.routes.js
 *
 * Único lugar del backend con rutas SIN `authenticate` — a propósito:
 * es la puerta de entrada de los enlaces de "Compartir" (ver
 * services/share.service.js). El token en la URL es la única
 * autorización; no hay sesión, no hay cookie de CSRF que revisar (son
 * todas GET, no mutan nada).
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicDashboardRateLimiter } from '../middleware/rateLimiters.js';
import * as shareController from '../controllers/share.controller.js';

const router = Router();

router.get('/dashboards/:token', publicDashboardRateLimiter, asyncHandler(shareController.getPublicDashboard));

export default router;
