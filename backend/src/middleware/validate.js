/**
 * middleware/validate.js
 *
 * Middleware factory que valida `req.body` contra un schema de Joi.
 * Reemplaza `req.body` por el valor ya saneado/convertido por Joi
 * (`stripUnknown`) — así los controllers reciben siempre datos con forma
 * garantizada, nunca campos extra no solicitados (mitiga Mass Assignment
 * en conjunto con que los repositories solo escriben columnas explícitas).
 */

import { ValidationError } from '../errors/AppError.js';

export function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const details = error.details.map((d) => ({ field: d.path.join('.'), message: d.message }));
      return next(new ValidationError('Los datos enviados no son válidos', details));
    }
    req.body = value;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const details = error.details.map((d) => ({ field: d.path.join('.'), message: d.message }));
      return next(new ValidationError('Parámetros de consulta no válidos', details));
    }
    req.query = value;
    next();
  };
}
