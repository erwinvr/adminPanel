/**
 * middleware/csrf.js
 *
 * Protección CSRF por "double-submit cookie": el servidor emite un token
 * aleatorio en una cookie NO HttpOnly (el frontend puede leerla), y exige
 * que ese mismo valor viaje en el header `X-CSRF-Token` en cada request
 * mutante (POST/PATCH/DELETE). Un sitio atacante puede lograr que el
 * navegador de la víctima envíe la cookie automáticamente, pero no puede
 * leer su valor para copiarlo al header (violaría same-origin policy) —
 * por eso el ataque falla.
 *
 * Complementa, no reemplaza, a `SameSite=Strict` en la cookie de sesión
 * (ver auth/session.js), que ya es la primera línea de defensa.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { AuthorizationError } from '../errors/AppError.js';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const idx = c.indexOf('=');
        return [decodeURIComponent(c.slice(0, idx)), decodeURIComponent(c.slice(idx + 1))];
      })
  );
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a ?? '');
  const bufB = Buffer.from(b ?? '');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Se monta en toda la app. En GET/HEAD/OPTIONS, si no existe la cookie
 * CSRF todavía, la emite (para que el frontend pueda leerla antes del
 * primer POST). En métodos mutantes, valida cookie === header.
 */
export function csrfProtection(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[CSRF_COOKIE_NAME];

  if (SAFE_METHODS.has(req.method)) {
    if (!cookieToken) {
      const token = randomBytes(32).toString('hex');
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // el frontend debe poder leerla para reenviarla en el header
        secure: env.isProduction,
        sameSite: 'strict',
        maxAge: env.session.maxAgeMs,
      });
    }
    return next();
  }

  const headerToken = req.headers[CSRF_HEADER_NAME];
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return next(new AuthorizationError('Token CSRF inválido o ausente'));
  }

  next();
}
