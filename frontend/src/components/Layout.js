/**
 * components/Layout.js
 *
 * Estructura común a todas las páginas autenticadas: barra lateral de
 * navegación (los ítems se ocultan según `auth.hasPermission()`, solo
 * UX) + barra superior con el usuario actual y logout + contenedor de
 * contenido donde cada página monta su propio DOM.
 */

import { auth } from '../auth/session.js';
import { navigate } from '../router/router.js';
import { toast } from './Toast.js';
import { PERMISSIONS } from '../permissions/catalog.js';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Inicio', permission: null },
  { path: '/users', label: 'Usuarios', permission: PERMISSIONS.USERS_VIEW },
  { path: '/roles', label: 'Roles y permisos', permission: PERMISSIONS.ROLES_VIEW },
  { path: '/audit', label: 'Auditoría', permission: PERMISSIONS.AUDIT_VIEW },
  { path: '/topology', label: 'Mapa de topología', permission: PERMISSIONS.TOPOLOGY_VIEW },
  { path: '/topology/admin', label: 'Administración de topología', permission: PERMISSIONS.TOPOLOGY_EDIT },
];

/**
 * @param {HTMLElement} contentEl - nodo con el contenido de la página actual
 * @returns {{ root: HTMLElement, content: HTMLElement }}
 */
export function Layout(contentEl) {
  const root = document.createElement('div');
  root.className = 'layout';

  const sidebar = document.createElement('nav');
  sidebar.className = 'layout__sidebar';
  sidebar.innerHTML = '<div class="layout__brand">Panel de Administración</div>';

  NAV_ITEMS.forEach((item) => {
    if (item.permission && !auth.hasPermission(item.permission)) return;
    const link = document.createElement('a');
    link.href = `#${item.path}`;
    link.className = 'layout__nav-link';
    if (window.location.hash === `#${item.path}`) link.classList.add('layout__nav-link--active');
    link.textContent = item.label;
    sidebar.appendChild(link);
  });

  const main = document.createElement('div');
  main.className = 'layout__main';

  const topbar = document.createElement('header');
  topbar.className = 'layout__topbar';
  const userLabel = document.createElement('span');
  userLabel.textContent = auth.user ? `${auth.user.first_name} ${auth.user.last_name} (@${auth.user.username})` : '';
  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'btn btn--ghost';
  logoutBtn.textContent = 'Cerrar sesión';
  logoutBtn.addEventListener('click', async () => {
    await auth.logout();
    toast.info('Sesión cerrada');
    navigate('/login');
  });
  topbar.append(userLabel, logoutBtn);

  const content = document.createElement('main');
  content.className = 'layout__content';
  content.appendChild(contentEl);

  main.append(topbar, content);
  root.append(sidebar, main);

  return root;
}
