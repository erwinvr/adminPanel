/**
 * App.jsx
 *
 * Declara las rutas de la app (HashRouter, ver main.jsx — conserva el
 * esquema #/usuarios, #/roles, etc. para no depender de configuración
 * especial de servidor). Cada ruta protegida declara `permission`
 * opcional: si el usuario no lo tiene, se redirige a /dashboard en vez
 * de renderizar la página — de nuevo, esto es solo UX; el backend
 * igual re-valida cada request.
 */

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { PERMISSIONS } from './permissions/catalog.js';
import { LoginPage } from './pages/LoginPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { UsersPage } from './pages/UsersPage.jsx';
import { RolesPage } from './pages/RolesPage.jsx';
import { AuditPage } from './pages/AuditPage.jsx';
import { TopologyAdminPage } from './pages/TopologyAdminPage.jsx';
import { ProvidersDashboardPage } from './pages/ProvidersDashboardPage.jsx';
import { ProvidersPage } from './pages/ProvidersPage.jsx';
import { LicensesPage } from './pages/LicensesPage.jsx';
import { M365SettingsPage } from './pages/M365SettingsPage.jsx';
import { M365LicensesPage } from './pages/M365LicensesPage.jsx';
import { M365UsersPage } from './pages/M365UsersPage.jsx';
import { M365MfaPage } from './pages/M365MfaPage.jsx';

// React Flow (usado solo acá) pesa bastante — se carga aparte para no
// sumarse al bundle inicial de las demás páginas.
const TopologyPage = lazy(() => import('./pages/TopologyPage.jsx').then((m) => ({ default: m.TopologyPage })));

function ProtectedRoute({ permission, children }) {
  const { isAuthenticated, hasPermission } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/dashboard" replace />;
  return children;
}

export function App() {
  const { loading } = useAuth();

  if (loading) {
    return <p className="boot-message">Cargando aplicación…</p>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute permission={PERMISSIONS.USERS_VIEW}>
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/roles"
        element={
          <ProtectedRoute permission={PERMISSIONS.ROLES_VIEW}>
            <RolesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute permission={PERMISSIONS.AUDIT_VIEW}>
            <AuditPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/topology"
        element={
          <ProtectedRoute permission={PERMISSIONS.TOPOLOGY_VIEW}>
            <Suspense fallback={<p className="p-6 text-muted-foreground">Cargando…</p>}>
              <TopologyPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/topology/admin"
        element={
          <ProtectedRoute permission={PERMISSIONS.TOPOLOGY_EDIT}>
            <TopologyAdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/providers"
        element={
          <ProtectedRoute permission={PERMISSIONS.PROVIDERS_VIEW}>
            <ProvidersDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/providers/admin"
        element={
          <ProtectedRoute permission={PERMISSIONS.PROVIDERS_EDIT}>
            <ProvidersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/licenses"
        element={
          <ProtectedRoute permission={PERMISSIONS.LICENSES_VIEW}>
            <LicensesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/m365/settings"
        element={
          <ProtectedRoute permission={PERMISSIONS.M365_EDIT}>
            <M365SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/m365/licenses"
        element={
          <ProtectedRoute permission={PERMISSIONS.M365_VIEW}>
            <M365LicensesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/m365/users"
        element={
          <ProtectedRoute permission={PERMISSIONS.M365_VIEW}>
            <M365UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/m365/mfa"
        element={
          <ProtectedRoute permission={PERMISSIONS.M365_VIEW}>
            <M365MfaPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
