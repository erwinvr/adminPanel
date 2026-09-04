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
import {
  ChevronRight,
  Network,
  Truck,
  Users,
  KeyRound,
  Cloud,
  Settings,
  ShieldCheck,
  Shield,
  ScrollText,
  Boxes,
  Server,
  Building2,
  Lock,
  FolderTree,
  ChartColumn,
  HardDrive,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';
import { PERMISSIONS } from '../permissions/catalog.js';
import { Button } from '@/components/ui/button.jsx';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.jsx';
import { cn } from '@/lib/utils.js';

// "Dashboard" queda como lista plana (sin colapsar) — son las 3 vistas de
// consulta que se usan a diario. El resto de las secciones son de
// administración (altas/bajas/modificaciones, config, seguridad) y se
// agrupan bajo el rótulo "Gestión", cada una colapsable por separado.
const DASHBOARD_ITEMS = [
  { path: '/topology', label: 'Mapa de aplicaciones', permission: PERMISSIONS.TOPOLOGY_VIEW, icon: Network },
  { path: '/providers', label: 'Proveedores y recursos', permission: PERMISSIONS.PROVIDERS_VIEW, icon: Truck },
  { path: '/dashboard/users', label: 'Usuarios', permission: PERMISSIONS.INSIGHTS_VIEW, icon: ChartColumn },
  { path: '/backups/dashboard', label: 'Backups', permission: PERMISSIONS.BACKUPS_VIEW, icon: HardDrive },
  { path: '/vuln/dashboard', label: 'Vulnerabilidades', permission: PERMISSIONS.VULN_VIEW, icon: ShieldAlert },
];

const MANAGEMENT_SECTIONS = [
  {
    key: 'abm',
    label: 'Parámetros',
    icon: Boxes,
    items: [
      { path: '/topology/admin', label: 'Aplicaciones', permission: PERMISSIONS.TOPOLOGY_EDIT, icon: Network },
      { path: '/providers/admin', label: 'Proveedores', permission: PERMISSIONS.PROVIDERS_EDIT, icon: Truck },
      { path: '/licenses', label: 'Licencias', permission: PERMISSIONS.LICENSES_VIEW, icon: KeyRound },
      { path: '/inventory', label: 'Hardware', permission: PERMISSIONS.INVENTORY_VIEW, icon: Server },
      { path: '/offices', label: 'Oficinas', permission: PERMISSIONS.OFFICES_VIEW, icon: Building2 },
      { path: '/vault', label: 'Bóveda de contraseñas', permission: PERMISSIONS.VAULT_VIEW, icon: Lock },
    ],
  },
  {
    key: 'm365',
    label: 'Microsoft 365',
    icon: Cloud,
    items: [
      { path: '/m365/settings', label: 'Configuración', permission: PERMISSIONS.M365_EDIT, icon: Settings },
      { path: '/m365/licenses', label: 'Licencias compradas', permission: PERMISSIONS.M365_VIEW, icon: KeyRound },
      { path: '/m365/users', label: 'Usuarios sincronizados', permission: PERMISSIONS.M365_VIEW, icon: Users },
      { path: '/m365/mfa', label: 'MFA de usuarios', permission: PERMISSIONS.M365_VIEW, icon: ShieldCheck },
    ],
  },
  {
    key: 'ad',
    label: 'Active Directory',
    icon: FolderTree,
    items: [
      { path: '/ad/settings', label: 'Configuración', permission: PERMISSIONS.AD_EDIT, icon: Settings },
      { path: '/ad/users', label: 'Usuarios del AD', permission: PERMISSIONS.AD_VIEW, icon: Users },
    ],
  },
  {
    key: 'backups',
    label: 'Backups',
    icon: HardDrive,
    items: [{ path: '/backups/settings', label: 'Configuración', permission: PERMISSIONS.BACKUPS_EDIT, icon: Settings }],
  },
  {
    key: 'vuln',
    label: 'Vulnerabilidades',
    icon: ShieldAlert,
    items: [{ path: '/vuln/settings', label: 'Configuración', permission: PERMISSIONS.VULN_EDIT, icon: Settings }],
  },
  {
    key: 'security',
    label: 'Seguridad',
    icon: Shield,
    items: [
      { path: '/users', label: 'Usuarios', permission: PERMISSIONS.USERS_VIEW, icon: Users },
      { path: '/roles', label: 'Roles y permisos', permission: PERMISSIONS.ROLES_VIEW, icon: Shield },
    ],
  },
  {
    key: 'audit',
    label: 'Auditoría',
    icon: ScrollText,
    items: [{ path: '/audit', label: 'Auditoría', permission: PERMISSIONS.AUDIT_VIEW, icon: ScrollText }],
  },
];

export function Layout({ children }) {
  const { user, hasPermission, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const visibleDashboardItems = useMemo(
    () => DASHBOARD_ITEMS.filter((item) => !item.permission || hasPermission(item.permission)),
    [hasPermission]
  );

  const visibleSections = useMemo(
    () =>
      MANAGEMENT_SECTIONS.map((section) => ({
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
        <div className="mb-2 flex items-center gap-2 border-b border-white/15 px-4 pb-4 font-semibold text-white">
          <span
            className="size-2 shrink-0 rounded-full bg-primary"
            style={{ boxShadow: '0 0 8px 2px var(--primary)' }}
          />
          Panel de Administración
        </div>

        {visibleDashboardItems.length > 0 && (
          <div className="flex flex-col pb-1">
            <div className="px-4 py-2.5 text-[11px] font-bold tracking-wide text-sidebar-foreground/70 uppercase">
              Dashboard
            </div>
            {visibleDashboardItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-4 py-2 pl-7 text-[13.5px] text-sidebar-foreground no-underline hover:bg-white/10 hover:text-white',
                    isActive && 'bg-white/10 font-medium text-white'
                  )
                }
              >
                <item.icon className="size-3.5 shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </div>
        )}

        {visibleSections.length > 0 && (
          <div className="px-4 pt-3 pb-1 text-[11px] font-bold tracking-wide text-sidebar-foreground/50 uppercase">
            Gestión
          </div>
        )}
        {visibleSections.map((section) => {
          const isOpen = expanded.has(section.key);
          return (
            <Collapsible key={section.key} open={isOpen} onOpenChange={(open) => toggleSection(section.key, open)}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[11px] font-bold tracking-wide text-sidebar-foreground/70 uppercase hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <section.icon className="size-3.5 shrink-0 normal-case" />
                    {section.label}
                  </span>
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
                        'flex items-center gap-2 px-4 py-2 pl-7 text-[13.5px] text-sidebar-foreground no-underline hover:bg-white/10 hover:text-white',
                        isActive && 'bg-white/10 font-medium text-white'
                      )
                    }
                  >
                    <item.icon className="size-3.5 shrink-0" />
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
