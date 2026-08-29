/**
 * components/Layout.jsx
 *
 * Estructura común a todas las páginas autenticadas: barra lateral de
 * navegación organizada en secciones colapsables (Dashboard, ABM,
 * Microsoft 365, Seguridad, Auditoría) + barra superior con el usuario
 * actual y logout + contenido de la página como children.
 *
 * Un ítem se oculta si el usuario no tiene su `permission` (solo UX —
 * el router y el backend igual revalidan). Una sección entera se oculta
 * si TODOS sus ítems quedaron ocultos. La sección que contiene la ruta
 * activa se expande automáticamente; el resto las abre/cierra el
 * usuario a mano y quedan como estén mientras navega.
 */

import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { PERMISSIONS } from '../permissions/catalog.js';
import { Button } from '@/components/ui/button.jsx';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.jsx';
import { cn } from '@/lib/utils.js';

const NAV_SECTIONS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    items: [
      { path: '/dashboard', label: 'Inicio', permission: null },
      { path: '/topology', label: 'Mapa de topología', permission: PERMISSIONS.TOPOLOGY_VIEW },
      { path: '/providers', label: 'Proveedores y recursos', permission: PERMISSIONS.PROVIDERS_VIEW },
    ],
  },
  {
    key: 'abm',
    label: 'ABM',
    items: [
      { path: '/users', label: 'Usuarios', permission: PERMISSIONS.USERS_VIEW },
      { path: '/topology/admin', label: 'Administración de topología', permission: PERMISSIONS.TOPOLOGY_EDIT },
      { path: '/providers/admin', label: 'Administración de proveedores', permission: PERMISSIONS.PROVIDERS_EDIT },
      { path: '/licenses', label: 'Licencias', permission: PERMISSIONS.LICENSES_VIEW },
    ],
  },
  {
    key: 'm365',
    label: 'Microsoft 365',
    items: [
      { path: '/m365/settings', label: 'Configuración', permission: PERMISSIONS.M365_EDIT },
      { path: '/m365/licenses', label: 'Licencias compradas', permission: PERMISSIONS.M365_VIEW },
      { path: '/m365/users', label: 'Usuarios sincronizados', permission: PERMISSIONS.M365_VIEW },
      { path: '/m365/mfa', label: 'MFA de usuarios', permission: PERMISSIONS.M365_VIEW },
    ],
  },
  {
    key: 'security',
    label: 'Seguridad',
    items: [{ path: '/roles', label: 'Roles y permisos', permission: PERMISSIONS.ROLES_VIEW }],
  },
  {
    key: 'audit',
    label: 'Auditoría',
    items: [{ path: '/audit', label: 'Auditoría', permission: PERMISSIONS.AUDIT_VIEW }],
  },
];

export function Layout({ children }) {
  const { user, hasPermission, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const visibleSections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.permission || hasPermission(item.permission)),
      })).filter((section) => section.items.length > 0),
    [hasPermission]
  );

  const activeSectionKey = useMemo(
    () => visibleSections.find((section) => section.items.some((item) => item.path === location.pathname))?.key,
    [visibleSections, location.pathname]
  );

  const [expanded, setExpanded] = useState(() => new Set(activeSectionKey ? [activeSectionKey] : []));

  // Al navegar a una sección distinta (ej. clic directo, atrás/adelante
  // del navegador), la aseguramos expandida sin cerrar las que el
  // usuario ya haya abierto por su cuenta.
  useEffect(() => {
    if (!activeSectionKey) return;
    setExpanded((prev) => (prev.has(activeSectionKey) ? prev : new Set(prev).add(activeSectionKey)));
  }, [activeSectionKey]);

  function toggleSection(key, isOpen) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleLogout() {
    await logout();
    toast.info('Sesión cerrada');
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen">
      <nav className="flex w-56 flex-shrink-0 flex-col bg-sidebar py-4 text-sidebar-foreground">
        <div className="mb-2 border-b border-white/15 px-4 pb-4 font-semibold text-white">Panel de Administración</div>
        {visibleSections.map((section) => {
          const isOpen = expanded.has(section.key);
          return (
            <Collapsible key={section.key} open={isOpen} onOpenChange={(open) => toggleSection(section.key, open)}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[11px] font-bold tracking-wide text-sidebar-foreground/70 uppercase hover:text-white"
                >
                  <span>{section.label}</span>
                  <ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col pb-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end
                    className={({ isActive }) =>
                      cn(
                        'px-4 py-2 pl-7 text-[13.5px] text-sidebar-foreground no-underline hover:bg-white/10 hover:text-white',
                        isActive && 'bg-white/10 font-medium text-white'
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b bg-card px-6 py-3">
          <span className="text-sm">{user ? `${user.first_name} ${user.last_name} (@${user.username})` : ''}</span>
          <Button type="button" variant="ghost" onClick={handleLogout}>
            Cerrar sesión
          </Button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
