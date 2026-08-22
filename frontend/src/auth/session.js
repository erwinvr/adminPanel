/**
 * auth/session.js
 *
 * Estado de sesión del frontend, en memoria (nunca en localStorage —
 * la sesión real vive en la cookie HttpOnly que el navegador maneja
 * solo). Expone `auth.hasPermission()` como abstracción centralizada:
 * el resto del frontend nunca compara permisos "a mano".
 *
 * IMPORTANTE (recordatorio del propio proyecto): esto es SOLO para UX
 * (ocultar botones, ocultar menús). El backend vuelve a validar cada
 * permiso en cada request — este módulo no es una medida de seguridad.
 */

import { authService } from '../services/auth.service.js';

let currentUser = null; // { id, username, email, permissions: string[], ... } | null

export const auth = {
  get user() {
    return currentUser;
  },

  isAuthenticated() {
    return currentUser !== null;
  },

  hasPermission(code) {
    return currentUser?.permissions?.includes(code) ?? false;
  },

  async refresh() {
    try {
      currentUser = await authService.me();
    } catch {
      currentUser = null;
    }
    return currentUser;
  },

  async login(identifier, password) {
    currentUser = await authService.login(identifier, password);
    return currentUser;
  },

  async logout() {
    await authService.logout();
    currentUser = null;
  },

  clear() {
    currentUser = null;
  },
};

// Si el backend responde 401 en cualquier request, la sesión del
// frontend se considera cerrada — el router (app.js) escucha este mismo
// evento para redirigir a /login.
window.addEventListener('auth:unauthorized', () => {
  currentUser = null;
});
