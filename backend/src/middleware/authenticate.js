/**
 * middleware/authenticate.js
 *
 * Verifica que exista una sesión válida. Se monta antes de
 * `requirePermission` en cualquier ruta protegida. NO valida permisos
 * (eso es responsabilidad de requirePermission) — solo identidad.
 */

import { AuthenticationError } from '../errors/AppError.js';

export function authenticate(req, res, next) {
  if (!req.session || !req.session.userId) {
    return next(new AuthenticationError());
  }
  next();
}
