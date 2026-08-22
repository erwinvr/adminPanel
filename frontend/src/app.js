/**
 * app.js
 *
 * Punto de entrada del frontend. Registra las rutas, resuelve la sesión
 * actual (si existe cookie válida) y arranca el router.
 */

import { auth } from './auth/session.js';
import { registerRoute, startRouter } from './router/router.js';
import { renderLoginPage } from './pages/login.page.js';
import { renderDashboardPage } from './pages/dashboard.page.js';
import { renderUsersPage } from './pages/users.page.js';
import { renderRolesPage } from './pages/roles.page.js';
import { renderAuditPage } from './pages/audit.page.js';
import { renderTopologyPage } from './pages/topology.page.js';
import { renderTopologyAdminPage } from './pages/topology-admin.page.js';
import { PERMISSIONS } from './permissions/catalog.js';

registerRoute('/login', { render: renderLoginPage, isPublic: true });
registerRoute('/dashboard', { render: renderDashboardPage });
registerRoute('/users', { render: renderUsersPage, permission: PERMISSIONS.USERS_VIEW });
registerRoute('/roles', { render: renderRolesPage, permission: PERMISSIONS.ROLES_VIEW });
registerRoute('/audit', { render: renderAuditPage, permission: PERMISSIONS.AUDIT_VIEW });
registerRoute('/topology', { render: renderTopologyPage, permission: PERMISSIONS.TOPOLOGY_VIEW });
registerRoute('/topology/admin', { render: renderTopologyAdminPage, permission: PERMISSIONS.TOPOLOGY_EDIT });

async function bootstrap() {
  await auth.refresh(); // intenta recuperar la sesión desde la cookie existente
  startRouter();
}

bootstrap();
