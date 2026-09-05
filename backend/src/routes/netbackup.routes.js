import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { createDeviceSchema, updateDeviceSchema, diffQuerySchema } from '../validators/netbackup.validator.js';
import * as netbackupController from '../controllers/netbackup.controller.js';

const router = Router();

router.use(authenticate);

router.get('/devices', requirePermission(PERMISSIONS.NETBACKUP_EDIT), asyncHandler(netbackupController.listDevices));

// Ruta fija ANTES de "/devices/:id" — si no, Express la matchearía como si "available" fuera un :id.
router.get(
  '/devices/available',
  requirePermission(PERMISSIONS.NETBACKUP_EDIT),
  asyncHandler(netbackupController.listAvailableHardware)
);

router.post(
  '/devices',
  requirePermission(PERMISSIONS.NETBACKUP_EDIT),
  validateBody(createDeviceSchema),
  asyncHandler(netbackupController.createDevice)
);

router.patch(
  '/devices/:id',
  requirePermission(PERMISSIONS.NETBACKUP_EDIT),
  validateBody(updateDeviceSchema),
  asyncHandler(netbackupController.updateDevice)
);

router.delete('/devices/:id', requirePermission(PERMISSIONS.NETBACKUP_EDIT), asyncHandler(netbackupController.deleteDevice));

router.post('/devices/:id/run', requirePermission(PERMISSIONS.NETBACKUP_EDIT), asyncHandler(netbackupController.runBackup));

router.get('/runs', requirePermission(PERMISSIONS.NETBACKUP_VIEW), asyncHandler(netbackupController.listRuns));

// Bitácora: resumen por dispositivo, versiones de un dispositivo, y
// diff entre dos corridas — todo de solo lectura (NETBACKUP_VIEW).
router.get(
  '/devices/config-summary',
  requirePermission(PERMISSIONS.NETBACKUP_VIEW),
  asyncHandler(netbackupController.getConfigSummary)
);

router.get(
  '/devices/:id/versions',
  requirePermission(PERMISSIONS.NETBACKUP_VIEW),
  asyncHandler(netbackupController.listDeviceVersions)
);

router.get(
  '/runs/diff',
  requirePermission(PERMISSIONS.NETBACKUP_VIEW),
  validateQuery(diffQuerySchema),
  asyncHandler(netbackupController.diffRuns)
);

router.get('/runs/:id/config', requirePermission(PERMISSIONS.NETBACKUP_VIEW), asyncHandler(netbackupController.getRunConfig));

export default router;
