/**
 * services/role.service.js
 *
 * ABM de roles + asignación de permisos. Los roles `is_system` (ej.
 * 'administrator') no pueden eliminarse ni tener su nombre modificado
 * desde aquí — protección explícita, no solo "no expuesta en la UI".
 */

import { db } from '../config/database.js';
import { roleRepository } from '../repositories/role.repository.js';
import { permissionRepository } from '../repositories/permission.repository.js';
import { recordEvent } from '../audit/audit.service.js';
import { invalidatePermissionCache } from '../permissions/permissionResolver.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js';

async function validatePermissionIds(permissionIds) {
  if (!permissionIds || permissionIds.length === 0) return;
  const all = await permissionRepository.listAll();
  const validIds = new Set(all.map((p) => p.id));
  const invalid = permissionIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    throw new ValidationError('Se incluyeron IDs de permiso que no existen', invalid);
  }
}

export const roleService = {
  async list() {
    const roles = await roleRepository.list();
    return Promise.all(
      roles.map(async (role) => ({
        ...role,
        permissions: await roleRepository.listPermissions(role.id),
      }))
    );
  },

  async getById(id) {
    const role = await roleRepository.findById(id);
    if (!role) throw new NotFoundError('Rol no encontrado');
    const permissions = await roleRepository.listPermissions(id);
    return { ...role, permissions };
  },

  async create(req, { name, description, permissionIds }) {
    const existing = await roleRepository.findByName(name);
    if (existing) throw new ConflictError('Ya existe un rol con ese nombre');

    await validatePermissionIds(permissionIds);
    const actorId = req.session.userId;

    const role = await db.transaction(async (trx) => {
      const created = await roleRepository.create({ name, description }, trx);
      if (permissionIds?.length) {
        await roleRepository.setPermissions(created.id, permissionIds, trx);
      }
      await recordEvent({
        userId: actorId,
        action: 'role.create',
        resource: 'role',
        resourceId: created.id,
        result: 'success',
        req,
        metadata: { name },
        trx,
      });
      return created;
    });

    return role;
  },

  async update(req, id, { description, permissionIds }) {
    const existing = await roleRepository.findById(id);
    if (!existing) throw new NotFoundError('Rol no encontrado');

    if (permissionIds !== undefined) {
      await validatePermissionIds(permissionIds);
    }

    const actorId = req.session.userId;

    const role = await db.transaction(async (trx) => {
      let updated = existing;
      if (description !== undefined) {
        updated = await roleRepository.update(id, { description }, trx);
      }
      if (permissionIds !== undefined) {
        await roleRepository.setPermissions(id, permissionIds, trx);
        invalidatePermissionCache(); // el cambio de permisos debe reflejarse de inmediato
      }
      await recordEvent({
        userId: actorId,
        action: 'role.update',
        resource: 'role',
        resourceId: id,
        result: 'success',
        req,
        metadata: { changedPermissions: permissionIds !== undefined },
        trx,
      });
      return updated;
    });

    return role;
  },

  async delete(req, id) {
    const existing = await roleRepository.findById(id);
    if (!existing) throw new NotFoundError('Rol no encontrado');
    if (existing.is_system) {
      throw new ValidationError('No se puede eliminar un rol de sistema');
    }
    const usersCount = await roleRepository.countUsersWithRole(id);
    if (usersCount > 0) {
      throw new ConflictError(`No se puede eliminar: hay ${usersCount} usuario(s) con este rol asignado`);
    }

    const actorId = req.session.userId;

    await db.transaction(async (trx) => {
      await roleRepository.delete(id, trx);
      invalidatePermissionCache();
      await recordEvent({
        userId: actorId,
        action: 'role.delete',
        resource: 'role',
        resourceId: id,
        result: 'success',
        req,
        metadata: { name: existing.name },
        trx,
      });
    });
  },
};
