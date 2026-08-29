/**
 * services/license.service.js
 *
 * Licencias de software, con vínculo opcional a un proveedor (relación
 * simple muchos-a-uno — a diferencia de proveedores↔aplicaciones, acá
 * no hace falta tabla intermedia ni diff de vínculos).
 */

import { db } from '../config/database.js';
import { licenseRepository } from '../repositories/license.repository.js';
import { providerRepository } from '../repositories/provider.repository.js';
import { recordEvent } from '../audit/audit.service.js';
import { NotFoundError } from '../errors/AppError.js';

async function assertProviderExists(providerId) {
  if (!providerId) return;
  const provider = await providerRepository.findProviderById(providerId);
  if (!provider) throw new NotFoundError('El proveedor seleccionado no existe');
}

export const licenseService = {
  listLicenses() {
    return licenseRepository.listLicenses();
  },

  async createLicense(req, { name, providerId, licenseKey, seats, expiresAt, notes }) {
    await assertProviderExists(providerId);
    const actorId = req.session.userId;

    const created = await db.transaction(async (trx) => {
      const [row] = await trx('licenses')
        .insert({
          name,
          provider_id: providerId || null,
          license_key: licenseKey || null,
          seats: seats ?? null,
          expires_at: expiresAt || null,
          notes: notes || null,
          created_by: actorId,
          updated_by: actorId,
        })
        .returning(['id']);

      await recordEvent({
        userId: actorId,
        action: 'license.create',
        resource: 'license',
        resourceId: row.id,
        result: 'success',
        req,
        metadata: { name, providerId: providerId || null },
        trx,
      });

      return row;
    });

    const all = await licenseRepository.listLicenses();
    return all.find((l) => l.id === created.id);
  },

  async updateLicense(req, id, changes) {
    const existing = await licenseRepository.findLicenseById(id);
    if (!existing) throw new NotFoundError('Licencia no encontrada');
    if (changes.providerId !== undefined) await assertProviderExists(changes.providerId);

    const actorId = req.session.userId;
    const dbChanges = {};
    if (changes.name !== undefined) dbChanges.name = changes.name;
    if (changes.providerId !== undefined) dbChanges.provider_id = changes.providerId || null;
    if (changes.licenseKey !== undefined) dbChanges.license_key = changes.licenseKey || null;
    if (changes.seats !== undefined) dbChanges.seats = changes.seats ?? null;
    if (changes.expiresAt !== undefined) dbChanges.expires_at = changes.expiresAt || null;
    if (changes.notes !== undefined) dbChanges.notes = changes.notes || null;

    await db.transaction(async (trx) => {
      await trx('licenses').where({ id }).update({ ...dbChanges, updated_by: actorId, updated_at: trx.fn.now() });

      await recordEvent({
        userId: actorId,
        action: 'license.update',
        resource: 'license',
        resourceId: id,
        result: 'success',
        req,
        metadata: { changes: Object.keys(changes) },
        trx,
      });
    });

    const all = await licenseRepository.listLicenses();
    return all.find((l) => l.id === id);
  },

  async deleteLicense(req, id) {
    const existing = await licenseRepository.findLicenseById(id);
    if (!existing) throw new NotFoundError('Licencia no encontrada');

    const actorId = req.session.userId;

    await db.transaction(async (trx) => {
      await trx('licenses').where({ id }).del();
      await recordEvent({
        userId: actorId,
        action: 'license.delete',
        resource: 'license',
        resourceId: id,
        result: 'success',
        req,
        metadata: { name: existing.name },
        trx,
      });
    });
  },
};
