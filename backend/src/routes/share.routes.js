/**
 * routes/share.routes.js
 *
 * Gestión (autenticada) de enlaces de "Compartir": ver estado, generar,
 * revocar. El permiso requerido depende de CUÁL dashboard se está
 * compartiendo — mismo permiso que hace falta para verlo ya
 * autenticado (si podés ver el dashboard, podés generarle un enlace
 * público). El acceso público en sí (sin login) vive en
 * public.routes.js, nunca acá.
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { resolveEffectivePermissions } from '../permissions/permissionResolver.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { AuthorizationError } from '../errors/AppError.js';
import * as shareController from '../controllers/share.controller.js';

const DASHBOARD_KEY_PERMISSIONS = {
  topology: PERMISSIONS.TOPOLOGY_VIEW,
  providers: PERMISSIONS.PROVIDERS_VIEW,
  'users-insights': PERMISSIONS.INSIGHTS_VIEW,
};

// Réplica de requirePermission.js, pero resolviendo el código de
// permiso a partir de :dashboardKey en vez de uno fijo por ruta — un
// dashboardKey inválido cae en 403 en vez de exponer cuáles son válidos.
function requireDashboardPermission() {
  return async (req, res, next) => {
    const required = DASHBOARD_KEY_PERMISSIONS[req.params.dashboardKey];
    if (!required) return next(new AuthorizationError());

    const roleIds = req.session.roleIds ?? [];
    const effectivePermissions = await resolveEffectivePermissions(roleIds);
    if (!effectivePermissions.includes(required)) return next(new AuthorizationError());

    next();
  };
}

const router = Router();

router.use(authenticate);
router.use('/:dashboardKey', requireDashboardPermission());

router.get('/:dashboardKey', asyncHandler(shareController.getStatus));
router.post('/:dashboardKey', asyncHandler(shareController.createShare));
router.delete('/:dashboardKey', asyncHandler(shareController.revokeShare));

export default router;
