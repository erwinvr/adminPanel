/**
 * errors/AppError.js
 *
 * Jerarquía de errores de aplicación. Cada error tipado sabe su propio
 * status HTTP y un `code` estable (para que el frontend pueda reaccionar
 * a `error.code` sin depender del texto del mensaje, que puede cambiar).
 *
 * Los services/controllers deben lanzar (throw) estas clases en vez de
 * Error genéricos; el errorHandler central las traduce a la respuesta
 * HTTP correcta sin que cada controller tenga que saber de status codes.
 */

export class AppError extends Error {
  /**
   * @param {string} message - Mensaje seguro para mostrar al cliente.
   * @param {number} statusCode - Código HTTP.
   * @param {string} code - Código estable de error (ej. 'VALIDATION_ERROR').
   * @param {object} [details] - Detalle adicional seguro de exponer (ej. campos inválidos).
   */
  constructor(message, statusCode, code, details = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Marca los errores esperados/operacionales, para distinguirlos de bugs
    // (ver errorHandler: un error no-operacional se loguea como 'error' y
    // nunca expone su mensaje real al cliente).
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Los datos enviados no son válidos', details = undefined) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'No autenticado') {
    super(message, 401, 'UNAUTHENTICATED');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'No tiene permisos suficientes para esta acción') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'El recurso ya existe o entra en conflicto con el estado actual') {
    super(message, 409, 'CONFLICT');
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Demasiados intentos. Intente nuevamente más tarde') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}
