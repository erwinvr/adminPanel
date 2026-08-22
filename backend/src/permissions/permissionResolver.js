/**
 * permissions/permissionResolver.js
 *
 * Resuelve los permisos EFECTIVOS de un conjunto de roles, con una caché
 * en memoria de corta duración (60s) indexada por la combinación de
 * role_ids.
 *
 * Por qué existe esta caché: en sesión solo se guardan los `role_id` del
 * usuario (no los permisos resueltos), para que un cambio de permisos a
 * un rol se refleje casi de inmediato sin invalidar sesiones activas.
 * Sin caché, cada request autenticado dispararía un JOIN a la base de
 * datos solo para resolver permisos — con esta caché, el costo se paga
 * como máximo una vez por minuto por combinación de roles, no por
 * request.
 */

import { permissionRepository } from '../repositories/permission.repository.js';

const CACHE_TTL_MS = 60_000;
/** @type {Map<string, { codes: string[], expiresAt: number }>} */
const cache = new Map();

function cacheKey(roleIds) {
  return [...roleIds].sort().join(',');
}

/**
 * @param {string[]} roleIds
 * @returns {Promise<string[]>} códigos de permiso efectivos (sin duplicados)
 */
export async function resolveEffectivePermissions(roleIds) {
  if (!roleIds || roleIds.length === 0) return [];

  const key = cacheKey(roleIds);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.codes;
  }

  const codes = await permissionRepository.findEffectiveCodesForRoles(roleIds);
  cache.set(key, { codes, expiresAt: Date.now() + CACHE_TTL_MS });
  return codes;
}

/**
 * Invalida toda la caché. Se llama cuando se modifican los permisos de
 * un rol (Fase 6), para que el cambio se refleje de inmediato en vez de
 * esperar el TTL — sacrifica un poco de eficiencia de caché a cambio de
 * que "guardar permisos" se sienta instantáneo para quien administra.
 */
export function invalidatePermissionCache() {
  cache.clear();
}
