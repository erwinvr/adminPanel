/**
 * middleware/requirePermission.js
 *
 * Middleware factory: `requirePermission('users.create')` — SIEMPRE se
 * monta después de `authenticate` en la cadena de la ruta. Resuelve los
 * permisos efectivos del usuario a partir de los role_ids guardados en
 * sesión (nunca confía en permisos que el cliente pudiera enviar en el
 * request) y responde 403 si el código de permiso no está entre ellos.
 *
 * Esta es la ÚNICA fuente de verdad de autorización — cualquier ocultar
 * un botón en el frontend es solo UX, nunca reemplaza esta comprobación.
 */

import { resolveEffectivePermissions } from '../permissions/permissionResolver.js';
import { AuthorizationError, AuthenticationError } from '../errors/AppError.js';

/**
 * @param {string} permissionCode
 */
export function requirePermission(permissionCode) {
  return async (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return next(new AuthenticationError());
    }

    const roleIds = req.session.roleIds ?? [];
    const effectivePermissions = await resolveEffectivePermissions(roleIds);

    if (!effectivePermissions.includes(permissionCode)) {
      return next(new AuthorizationError());
    }

    next();
  };
}
