import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repositories/permission.repository.js', () => ({
  permissionRepository: {
    findEffectiveCodesForRoles: vi.fn(),
  },
}));

const { permissionRepository } = await import('../../src/repositories/permission.repository.js');
const { resolveEffectivePermissions, invalidatePermissionCache } = await import(
  '../../src/permissions/permissionResolver.js'
);

describe('permissions/permissionResolver', () => {
  beforeEach(() => {
    invalidatePermissionCache();
    vi.clearAllMocks();
  });

  it('devuelve arreglo vacío si no hay roles', async () => {
    const result = await resolveEffectivePermissions([]);
    expect(result).toEqual([]);
    expect(permissionRepository.findEffectiveCodesForRoles).not.toHaveBeenCalled();
  });

  it('consulta el repositorio la primera vez para una combinación de roles', async () => {
    permissionRepository.findEffectiveCodesForRoles.mockResolvedValue(['users.view', 'users.create']);

    const result = await resolveEffectivePermissions(['role-1']);

    expect(result).toEqual(['users.view', 'users.create']);
    expect(permissionRepository.findEffectiveCodesForRoles).toHaveBeenCalledTimes(1);
  });

  it('usa la caché en llamadas subsecuentes con los mismos roles (no vuelve a consultar la BD)', async () => {
    permissionRepository.findEffectiveCodesForRoles.mockResolvedValue(['users.view']);

    await resolveEffectivePermissions(['role-1']);
    await resolveEffectivePermissions(['role-1']);
    await resolveEffectivePermissions(['role-1']);

    expect(permissionRepository.findEffectiveCodesForRoles).toHaveBeenCalledTimes(1);
  });

  it('invalidatePermissionCache() fuerza una nueva consulta', async () => {
    permissionRepository.findEffectiveCodesForRoles.mockResolvedValue(['users.view']);

    await resolveEffectivePermissions(['role-1']);
    invalidatePermissionCache();
    await resolveEffectivePermissions(['role-1']);

    expect(permissionRepository.findEffectiveCodesForRoles).toHaveBeenCalledTimes(2);
  });

  it('distintas combinaciones de roles tienen entradas de caché distintas', async () => {
    permissionRepository.findEffectiveCodesForRoles.mockResolvedValue(['x']);

    await resolveEffectivePermissions(['role-1']);
    await resolveEffectivePermissions(['role-2']);

    expect(permissionRepository.findEffectiveCodesForRoles).toHaveBeenCalledTimes(2);
  });
});
