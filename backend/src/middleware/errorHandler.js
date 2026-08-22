/**
 * middleware/errorHandler.js
 *
 * Middleware de error de Express (4 argumentos: debe mantener esa firma
 * para que Express lo reconozca como manejador de errores).
 *
 * Reglas que aplica siempre:
 *  - Errores operacionales (instancias de AppError): se devuelve su
 *    status/code/message tal cual, son seguros de mostrar.
 *  - Errores NO operacionales (bugs, excepciones inesperadas de librerías):
 *    se loguean completos con stack trace, pero al cliente SOLO se le
 *    devuelve un mensaje genérico + status 500. Nunca se filtra el detalle
 *    interno, ni siquiera en development (para que el comportamiento sea
 *    el mismo que se probará en producción).
 */

import { AppError } from '../errors/AppError.js';
import { logger } from '../config/logger.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const isAppError = err instanceof AppError;

  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'INTERNAL_ERROR';
  const message = isAppError ? err.message : 'Ocurrió un error inesperado';

  const logPayload = {
    err,
    statusCode,
    code,
    path: req.originalUrl,
    method: req.method,
    userId: req.session?.userId ?? null,
  };

  if (isAppError && statusCode < 500) {
    // Errores esperados del negocio (validación, 403, 404, etc.): nivel 'warn'.
    logger.warn(logPayload, `Error de aplicación: ${message}`);
  } else {
    // Cualquier cosa no prevista: nivel 'error', con stack completo.
    logger.error(logPayload, `Error interno no manejado: ${err.message}`);
  }

  const body = {
    success: false,
    error: {
      code,
      message,
      ...(isAppError && err.details ? { details: err.details } : {}),
    },
  };

  res.status(statusCode).json(body);
}
