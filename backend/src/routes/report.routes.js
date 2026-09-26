import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import * as reportController from '../controllers/report.controller.js';

const router = Router();

router.use(authenticate);
router.use(requirePermission(PERMISSIONS.REPORTS_VIEW));

// Los filtros propios de cada reporte (umbrales) se validan en report.service.js
// según el reporte pedido — el middleware validateQuery descartaría los que no conoce.
router.get('/', asyncHandler(reportController.listReports));
router.get('/:key', asyncHandler(reportController.runReport));
router.get('/:key/export', asyncHandler(reportController.exportReport));

export default router;
