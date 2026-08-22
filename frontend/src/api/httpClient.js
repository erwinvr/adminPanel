/**
 * api/httpClient.js
 *
 * Único punto del frontend que hace `fetch()` directamente. Resuelve:
 *  - Rutas relativas (mismo origen, nginx proxea /api al backend).
 *  - Envío de la cookie de sesión (`credentials: 'include'`).
 *  - Token CSRF: lo lee de la cookie no-HttpOnly `csrf_token` (emitida
 *    por el backend en cualquier GET) y lo reenvía en el header
 *    `X-CSRF-Token` en cada request mutante — así el resto del frontend
 *    nunca tiene que pensar en CSRF.
 *  - 401: dispara un evento global `auth:unauthorized` en vez de manejar
 *    la redirección aquí mismo — así este módulo no depende del router.
 */

const API_BASE_URL = '/api';

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

async function request(path, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readCookie('csrf_token');
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    method,
    headers,
  });

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }

  if (response.status === 204) {
    return { data: null, meta: undefined };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiError('Respuesta del servidor no válida', response.status, 'INVALID_RESPONSE');
  }

  if (!response.ok) {
    const { code, message, details } = body?.error ?? {};
    throw new ApiError(message ?? 'Ocurrió un error inesperado', response.status, code ?? 'UNKNOWN_ERROR', details);
  }

  return { data: body.data, meta: body.meta };
}

export const httpClient = {
  get: async (path) => (await request(path, { method: 'GET' })).data,
  getWithMeta: (path) => request(path, { method: 'GET' }),
  post: async (path, body) => (await request(path, { method: 'POST', body: JSON.stringify(body) })).data,
  patch: async (path, body) => (await request(path, { method: 'PATCH', body: JSON.stringify(body) })).data,
  delete: async (path) => (await request(path, { method: 'DELETE' })).data,
};
