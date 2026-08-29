import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combina clases condicionales (clsx) resolviendo conflictos de Tailwind (twMerge) — convención estándar de shadcn/ui. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
