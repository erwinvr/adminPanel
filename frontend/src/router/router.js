/**
 * router/router.js
 *
 * Router mínimo basado en hash (#/usuarios, #/roles, etc.) — deliberado
 * para JS vanilla sin build step: funciona sirviendo un único
 * index.html sin configuración especial de servidor (más allá del
 * fallback SPA que ya tiene nginx.conf).
 *
 * Cada ruta declara `permission` opcional: si el usuario no tiene ese
 * permiso, el router lo redirige a /dashboard en vez de renderizar la
 * página — de nuevo, esto es solo UX; el backend igual re-valida cada
 * request.
 */

import { auth } from '../auth/session.js';

const routes = []; // { pattern: RegExp, paramNames: string[], render: fn, permission?: string, public?: boolean }

export function registerRoute(path, { render, permission = null, isPublic = false }) {
  const paramNames = [];
  const patternStr = path.replace(/:([a-zA-Z]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({ pattern: new RegExp(`^${patternStr}$`), paramNames, render, permission, isPublic });
}

function parseHash() {
  const hash = window.location.hash.slice(1) || '/';
  const [path] = hash.split('?');
  return path;
}

export function navigate(path) {
  window.location.hash = path;
}

async function resolve() {
  const path = parseHash();

  for (const route of routes) {
    const match = path.match(route.pattern);
    if (!match) continue;

    const params = Object.fromEntries(route.paramNames.map((name, i) => [name, match[i + 1]]));

    if (!route.isPublic && !auth.isAuthenticated()) {
      return navigate('/login');
    }
    if (route.permission && !auth.hasPermission(route.permission)) {
      return navigate('/dashboard');
    }

    return route.render(params);
  }

  return navigate('/dashboard');
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  resolve();
}

// Si el backend invalida la sesión (401 en cualquier request), volver a
// login inmediatamente, sin esperar a que el usuario navegue.
window.addEventListener('auth:unauthorized', () => {
  if (parseHash() !== '/login') navigate('/login');
});
