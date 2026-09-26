/** 'AAAA-MM-DD' (texto, sin zona horaria) → 'DD/MM/AAAA'. */
export function formatDay(day) {
  if (!day) return '—';
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}
