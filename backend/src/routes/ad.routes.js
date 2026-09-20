import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { saveSettingsSchema } from '../validators/ad.validator.js';
import * as adController from '../controllers/ad.controller.js';

const router = Router();

router.use(authenticate);

router.get('/settings', requirePermission(PERMISSIONS.AD_EDIT), asyncHandler(adController.getSettings));

router.patch(
  '/settings',
  requirePermission(PERMISSIONS.AD_EDIT),
  validateBody(saveSettingsSchema),
  asyncHandler(adController.saveSettings)
);

router.post('/sync', requirePermission(PERMISSIONS.AD_EDIT), asyncHandler(adController.sync));

router.get('/users', requirePermission(PERMISSIONS.AD_VIEW), asyncHandler(adController.listUsers));

router.get('/computers', requirePermission(PERMISSIONS.AD_VIEW), asyncHandler(adController.listComputers));

// Ruta fija ANTES de "/users/:id/unlock" — no hay ambigüedad real de
// path acá (GET vs POST, y "locked" nunca matchea como :id de un POST),
// pero se mantiene el mismo criterio que netbackup.routes.js por las dudas.
router.get('/users/locked', requirePermission(PERMISSIONS.AD_OPERATIONS_VIEW), asyncHandler(adController.listLockedUsers));

// Mismo sync completo que "Configuración → Sincronizar ahora"
// (adController.sync/adService.sync — no hay una variante "solo
// bloqueados", el sync siempre trae la foto completa de usuarios), pero
// expuesto con el permiso de OPERACIONES en vez de AD_EDIT: alguien que
// solo puede ver/desbloquear bloqueados no debería necesitar el permiso
// de configurar la conexión a AD para poder refrescar la lista antes de
// esperar el próximo sync automático.
router.post('/users/sync', requirePermission(PERMISSIONS.AD_OPERATIONS_VIEW), asyncHandler(adController.sync));

router.post(
  '/users/:id/unlock',
  requirePermission(PERMISSIONS.AD_OPERATIONS_UNLOCK),
  asyncHandler(adController.unlockUser)
);

export default router;
