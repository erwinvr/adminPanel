/**
 * services/inventory.service.js
 *
 * ABM de inventario de hardware físico (servidores y networking), con
 * vínculo OPCIONAL a un proveedor de soporte — misma relación simple
 * muchos-a-uno que licencias↔proveedor (ON DELETE SET NULL en la FK).
 */

import { db } from '../config/database.js';
import { inventoryRepository } from '../repositories/inventory.repository.js';
import { providerRepository } from '../repositories/provider.repository.js';
import { officeRepository } from '../repositories/office.repository.js';
import { recordEvent } from '../audit/audit.service.js';
import { NotFoundError } from '../errors/AppError.js';

async function assertProviderExists(providerId) {
  if (!providerId) return;
  const provider = await providerRepository.findProviderById(providerId);
  if (!provider) throw new NotFoundError('El proveedor seleccionado no existe');
}

async function assertOfficeExists(officeId) {
  const office = await officeRepository.findOfficeById(officeId);
  if (!office) throw new NotFoundError('La oficina seleccionada no existe');
}

export const inventoryService = {
  listItems() {
    return inventoryRepository.listItems();
  },

  async createItem(req, { type, brand, model, officeId, hasSupport, supportUntil, supportProviderId, managementIp }) {
    await assertOfficeExists(officeId);
    await assertProviderExists(supportProviderId);
    const actorId = req.session.userId;

    const created = await db.transaction(async (trx) => {
      const [row] = await trx('hardware_inventory')
        .insert({
          type,
          brand,
          model,
          office_id: officeId,
          management_ip: managementIp || null,
          has_support: hasSupport,
          support_until: hasSupport ? supportUntil || null : null,
          support_provider_id: hasSupport ? supportProviderId || null : null,
          created_by: actorId,
          updated_by: actorId,
        })
        .returning(['id']);

      await recordEvent({
        userId: actorId,
        action: 'hardware.create',
        resource: 'hardware_inventory',
        resourceId: row.id,
        result: 'success',
        req,
        metadata: { type, brand, model },
        trx,
      });

      return row;
    });

    const all = await inventoryRepository.listItems();
    return all.find((item) => item.id === created.id);
  },

  async updateItem(req, id, changes) {
    const existing = await inventoryRepository.findItemById(id);
    if (!existing) throw new NotFoundError('Ítem de inventario no encontrado');
    if (changes.officeId !== undefined) await assertOfficeExists(changes.officeId);
    if (changes.supportProviderId !== undefined) await assertProviderExists(changes.supportProviderId);

    const actorId = req.session.userId;
    const nextHasSupport = changes.hasSupport !== undefined ? changes.hasSupport : existing.has_support;

    const dbChanges = {};
    if (changes.type !== undefined) dbChanges.type = changes.type;
    if (changes.brand !== undefined) dbChanges.brand = changes.brand;
    if (changes.model !== undefined) dbChanges.model = changes.model;
    if (changes.officeId !== undefined) dbChanges.office_id = changes.officeId;
    if (changes.managementIp !== undefined) dbChanges.management_ip = changes.managementIp || null;
    if (changes.hasSupport !== undefined) dbChanges.has_support = changes.hasSupport;
    if (changes.supportUntil !== undefined) dbChanges.support_until = changes.supportUntil || null;
    if (changes.supportProviderId !== undefined) dbChanges.support_provider_id = changes.supportProviderId || null;

    // Si el ítem deja de tener soporte de fábrica, no tiene sentido
    // conservar una fecha de vencimiento o un proveedor de soporte.
    if (!nextHasSupport) {
      dbChanges.support_until = null;
      dbChanges.support_provider_id = null;
    }

    await db.transaction(async (trx) => {
      await trx('hardware_inventory')
        .where({ id })
        .update({ ...dbChanges, updated_by: actorId, updated_at: trx.fn.now() });

      await recordEvent({
        userId: actorId,
        action: 'hardware.update',
        resource: 'hardware_inventory',
        resourceId: id,
        result: 'success',
        req,
        metadata: { changes: Object.keys(changes) },
        trx,
      });
    });

    const all = await inventoryRepository.listItems();
    return all.find((item) => item.id === id);
  },

  async deleteItem(req, id) {
    const existing = await inventoryRepository.findItemById(id);
    if (!existing) throw new NotFoundError('Ítem de inventario no encontrado');

    const actorId = req.session.userId;

    await db.transaction(async (trx) => {
      await trx('hardware_inventory').where({ id }).del();
      await recordEvent({
        userId: actorId,
        action: 'hardware.delete',
        resource: 'hardware_inventory',
        resourceId: id,
        result: 'success',
        req,
        metadata: { brand: existing.brand, model: existing.model },
        trx,
      });
    });
  },
};
