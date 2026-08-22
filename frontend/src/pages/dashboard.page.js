import { auth } from '../auth/session.js';
import { Layout } from '../components/Layout.js';

export function renderDashboardPage() {
  const root = document.getElementById('app');
  root.innerHTML = '';

  const content = document.createElement('div');
  content.innerHTML = `
    <h1>Bienvenido, ${auth.user?.first_name ?? ''}</h1>
    <p>Seleccione una sección en el menú lateral.</p>
    ${auth.user?.must_change_password ? '<p class="alert alert--warning">Su contraseña es la inicial asignada — se recomienda cambiarla.</p>' : ''}
  `;

  root.appendChild(Layout(content));
}
