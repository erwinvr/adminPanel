/**
 * integrations/microsoft365/domainFilter.js
 *
 * Filtro de usuarios por dominio del userPrincipalName (lo que hay
 * después de la última "@"). Un invitado externo tiene un UPN del tipo
 * "persona_empresa.com#EXT#@tenant.onmicrosoft.com": su dominio es el
 * del tenant, no el de su empresa.
 */

export function domainOf(userPrincipalName) {
  if (!userPrincipalName || !userPrincipalName.includes('@')) return null;
  return userPrincipalName.slice(userPrincipalName.lastIndexOf('@') + 1).trim().toLowerCase() || null;
}

/** Usuarios por dominio (sobre todos los recibidos), de mayor a menor. */
export function countDomains(users) {
  const counts = new Map();
  for (const u of users) {
    const domain = domainOf(u.userPrincipalName) ?? '(sin dominio)';
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

/**
 * Deja solo los usuarios de los dominios permitidos. Lista vacía/nula =
 * sin filtro (se admiten todos). Un usuario sin dominio interpretable se
 * ignora cuando hay filtro activo.
 */
export function filterUsersByDomain(users, allowedDomains) {
  if (!allowedDomains?.length) return { admitted: users, ignoredCount: 0 };
  const allowed = new Set(allowedDomains.map((d) => d.toLowerCase()));
  const admitted = users.filter((u) => allowed.has(domainOf(u.userPrincipalName)));
  return { admitted, ignoredCount: users.length - admitted.length };
}
