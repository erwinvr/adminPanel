/**
 * context/AuthContext.jsx
 *
 * Estado de sesión del frontend, en memoria (nunca en localStorage —
 * la sesión real vive en la cookie HttpOnly que el navegador maneja
 * solo). `hasPermission()` es la única forma en que el resto del
 * frontend consulta permisos — nunca se comparan "a mano".
 *
 * IMPORTANTE (recordatorio del propio proyecto): esto es SOLO para UX
 * (ocultar botones, ocultar menús, redirigir rutas). El backend vuelve
 * a validar cada permiso en cada request — este módulo no es una
 * medida de seguridad.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authService } from '../services/auth.service.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await authService.me();
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Si el backend responde 401 en cualquier request, la sesión del
  // frontend se considera cerrada de inmediato, sin esperar a que el
  // usuario navegue (ver api/httpClient.js).
  useEffect(() => {
    function onUnauthorized() {
      setUser(null);
    }
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (identifier, password) => {
    const loggedInUser = await authService.login(identifier, password);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const hasPermission = useCallback((code) => user?.permissions?.includes(code) ?? false, [user]);

  const value = {
    user,
    loading,
    isAuthenticated: user !== null,
    hasPermission,
    login,
    logout,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() debe usarse dentro de <AuthProvider>');
  return ctx;
}
