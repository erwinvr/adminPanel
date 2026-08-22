/**
 * services/user.service.js
 *
 * Lógica de negocio del ABM de usuarios. Cada operación mutante corre
 * dentro de una transacción y escribe su propio evento de auditoría
 * dentro de esa misma transacción (ver audit/audit.service.js).
 */

import { db } from '../config/database.js';
import { userRepository } from '../repositories/user.repository.js';
import { roleRepository } from '../repositories/role.repository.js';
import { hashPassword, checkPasswordPolicy } from '../auth/password.js';
import { recordEvent } from '../audit/audit.service.js';
import { invalidatePermissionCache } from '../permissions/permissionResolver.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js';

export const userService = {
  list(query) {
    return userRepository.list(query);
  },

  async getById(id) {
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError('Usuario no encontrado');
    const roleIds = await roleRepository.listUserRoleIds(id);
    return { ...user, roleIds };
  },

  /**
   * @param {import('express').Request} req
   * @param {object} data
   */
  async create(req, data) {
    const exists = await userRepository.existsByUsernameOrEmail(data.username, data.email);
    if (exists) {
      throw new ConflictError('Ya existe un usuario con ese nombre de usuario o email');
    }

    const policy = checkPasswordPolicy(data.initialPassword);
    if (!policy.valid) {
      throw new ValidationError('La contraseña inicial no cumple la política mínima', policy.reasons);
    }

    const passwordHash = await hashPassword(data.initialPassword);
    const actorId = req.session.userId;

    const created = await db.transaction(async (trx) => {
      const user = await userRepository.create(
        {
          first_name: data.firstName,
          last_name: data.lastName,
          username: data.username,
          email: data.email,
          password_hash: passwordHash,
          must_change_password: true,
          created_by: actorId,
        },
        trx
      );

      if (data.roleIds?.length) {
        await roleRepository.setUserRoles(user.id, data.roleIds, actorId, trx);
      }

      await recordEvent({
        userId: actorId,
        action: 'user.create',
        resource: 'user',
        resourceId: user.id,
        result: 'success',
        req,
        metadata: { username: user.username },
        trx,
      });

      return user;
    });

    return created;
  },

  /**
   * @param {import('express').Request} req
   * @param {string} id
   * @param {object} changes
   */
  async update(req, id, changes) {
    const existing = await userRepository.findById(id);
    if (!existing) throw new NotFoundError('Usuario no encontrado');

    if (changes.email) {
      const conflict = await userRepository.existsByUsernameOrEmail(existing.username, changes.email, id);
      if (conflict) throw new ConflictError('Ya existe un usuario con ese email');
    }

    const actorId = req.session.userId;
    const { roleIds, ...userChanges } = changes;

    const dbChanges = {};
    if (userChanges.firstName !== undefined) dbChanges.first_name = userChanges.firstName;
    if (userChanges.lastName !== undefined) dbChanges.last_name = userChanges.lastName;
    if (userChanges.email !== undefined) dbChanges.email = userChanges.email;
    if (userChanges.status !== undefined) dbChanges.status = userChanges.status;
    dbChanges.updated_by = actorId;

    const updated = await db.transaction(async (trx) => {
      let user = existing;
      if (Object.keys(dbChanges).length > 0) {
        user = await userRepository.update(id, dbChanges, trx);
      }

      if (roleIds !== undefined) {
        await roleRepository.setUserRoles(id, roleIds, actorId, trx);
        invalidatePermissionCache(); // los permisos del usuario pueden haber cambiado de inmediato
      }

      await recordEvent({
        userId: actorId,
        action: 'user.update',
        resource: 'user',
        resourceId: id,
        result: 'success',
        req,
        metadata: { changes: Object.keys(changes) },
        trx,
      });

      return user;
    });

    return updated;
  },

  /**
   * Desactivación (soft delete) — nunca DELETE físico, para preservar la
   * integridad referencial con audit_logs.
   * @param {import('express').Request} req
   * @param {string} id
   */
  async deactivate(req, id) {
    const existing = await userRepository.findById(id);
    if (!existing) throw new NotFoundError('Usuario no encontrado');

    if (id === req.session.userId) {
      throw new ValidationError('No puede desactivar su propio usuario');
    }

    const actorId = req.session.userId;

    await db.transaction(async (trx) => {
      await userRepository.update(id, { status: 'inactive', updated_by: actorId }, trx);
      await recordEvent({
        userId: actorId,
        action: 'user.deactivate',
        resource: 'user',
        resourceId: id,
        result: 'success',
        req,
        trx,
      });
    });
  },
};
