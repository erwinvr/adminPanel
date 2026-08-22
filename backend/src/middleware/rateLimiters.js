/**
 * middleware/rateLimiters.js
 *
 * Rate limiters específicos por endpoint sensible. El login tiene su
 * propio limiter (más estricto) separado de un eventual limiter global,
 * porque es el objetivo principal de ataques de fuerza bruta/credential
 * stuffing.
 */

import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { TooManyRequestsError } from '../errors/AppError.js';

function jsonRateLimitHandler(req, res, next) {
  next(new TooManyRequestsError());
}

export const loginRateLimiter = rateLimit({
  windowMs: env.loginRateLimit.windowMs,
  limit: env.loginRateLimit.maxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  // El rate limiting real es intencional y NO debe desactivarse en
  // development/production. Se desactiva únicamente en tests: la suite
  // de tests ejecuta muchos más logins (éxitos y fallos deliberados)
  // desde la misma IP simulada de lo que un usuario real haría, y no hay
  // un test dedicado a rate limiting en sí — bloquear login en medio de
  // otros tests solo produce falsos negativos, no cobertura real.
  skip: () => env.isTest,
  handler: jsonRateLimitHandler,
});

export const passwordResetRateLimiter = rateLimit({
  windowMs: env.loginRateLimit.windowMs,
  limit: env.loginRateLimit.maxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: jsonRateLimitHandler,
});
