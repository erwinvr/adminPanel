const VARIANT_CLASSES = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  destructive: 'bg-destructive text-white',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  muted: 'bg-muted text-muted-foreground',
};

/**
 * HTML de un badge (pill) con las mismas clases visuales que
 * <Badge> de shadcn/ui — para usarlo dentro de `render()` de
 * DataTable, donde no se puede montar un componente React
 * directamente (esas celdas se inyectan como HTML, no como JSX).
 */
export function badgeHtml(label, variant = 'default') {
  const cls = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default;
  return `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}">${label}</span>`;
}
