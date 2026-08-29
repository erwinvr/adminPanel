/**
 * services/provider.service.js
 *
 * Proveedores (vendors) y su vínculo con los recursos del mapa de
 * topología a los que abastecen. Un proveedor puede vincularse a
 * cualquier caja EXCEPTO las de la columna "Criticidad" (column_index
 * 0) — esa columna es una clasificación de impacto, no un recurso real
 * que alguien provea. Se valida acá, no en la base.
 */

import { db } from '../config/database.js';
import { providerRepository } from '../repositories/provider.repository.js';
import { topologyRepository } from '../repositories/topology.repository.js';
import { recordEvent } from '../audit/audit.service.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

const CRITICALITY_COLUMN_INDEX = 0;

export const providerService = {
  async listProviders() {
    const [providers, links] = await Promise.all([providerRepository.listProviders(), providerRepository.listAllLinks()]);
    return providers.map((p) => ({
      ...p,
      resources: links.filter((l) => l.providerId === p.id).map((l) => ({ id: l.id, name: l.name, col: l.col })),
    }));
  },

  async createProvider(req, { name, contactEmail, contactPhone, notes }) {
    const actorId = req.session.userId;

    const provider = await db.transaction(async (trx) => {
      const [created] = await trx('providers')
        .insert({
          name,
          contact_email: contactEmail || null,
          contact_phone: contactPhone || null,
          notes: notes || null,
          created_by: actorId,
          updated_by: actorId,
        })
        .returning(['id', 'name', 'contact_email as contactEmail', 'contact_phone as contactPhone', 'notes']);

      await recordEvent({
        userId: actorId,
        action: 'provider.create',
        resource: 'provider',
        resourceId: created.id,
        result: 'success',
        req,
        metadata: { name },
        trx,
      });

      return created;
    });

    return { ...provider, resources: [] };
  },

  async updateProvider(req, id, changes) {
    const existing = await providerRepository.findProviderById(id);
    if (!existing) throw new NotFoundError('Proveedor no encontrado');

    const actorId = req.session.userId;
    const dbChanges = {};
    if (changes.name !== undefined) dbChanges.name = changes.name;
    if (changes.contactEmail !== undefined) dbChanges.contact_email = changes.contactEmail || null;
    if (changes.contactPhone !== undefined) dbChanges.contact_phone = changes.contactPhone || null;
    if (changes.notes !== undefined) dbChanges.notes = changes.notes || null;

    const updated = await db.transaction(async (trx) => {
      const [row] = await trx('providers')
        .where({ id })
        .update({ ...dbChanges, updated_by: actorId, updated_at: trx.fn.now() })
        .returning(['id', 'name', 'contact_email as contactEmail', 'contact_phone as contactPhone', 'notes']);

      await recordEvent({
        userId: actorId,
        action: 'provider.update',
        resource: 'provider',
        resourceId: id,
        result: 'success',
        req,
        metadata: { changes: Object.keys(changes) },
        trx,
      });

      return row;
    });

    const resources = await providerRepository.listResourcesForProvider(id);
    return { ...updated, resources };
  },

  async deleteProvider(req, id) {
    const existing = await providerRepository.findProviderById(id);
    if (!existing) throw new NotFoundError('Proveedor no encontrado');

    const actorId = req.session.userId;

    await db.transaction(async (trx) => {
      await trx('providers').where({ id }).del(); // ON DELETE CASCADE borra sus vínculos
      await recordEvent({
        userId: actorId,
        action: 'provider.delete',
        resource: 'provider',
        resourceId: id,
        result: 'success',
        req,
        metadata: { name: existing.name },
        trx,
      });
    });
  },

  async setResources(req, providerId, nodeIds) {
    const provider = await providerRepository.findProviderById(providerId);
    if (!provider) throw new NotFoundError('Proveedor no encontrado');

    const uniqueIds = [...new Set(nodeIds)];

    if (uniqueIds.length) {
      const nodes = await topologyRepository.findNodesByIds(uniqueIds);
      if (nodes.length !== uniqueIds.length) throw new NotFoundError('Alguno de los recursos seleccionados no existe');
      if (nodes.some((n) => n.col === CRITICALITY_COLUMN_INDEX)) {
        throw new ValidationError('Un proveedor no puede vincularse a cajas de la categoría "Criticidad" (no es un recurso real)');
      }
    }

    const actorId = req.session.userId;
    const current = await providerRepository.listResourceIds(providerId);
    const currentSet = new Set(current);
    const nextSet = new Set(uniqueIds);
    const toAdd = uniqueIds.filter((id) => !currentSet.has(id));
    const toRemove = current.filter((id) => !nextSet.has(id));

    await db.transaction(async (trx) => {
      for (const nodeId of toAdd) {
        await trx('provider_resources').insert({ provider_id: providerId, node_id: nodeId, created_by: actorId });
      }
      if (toRemove.length) {
        await trx('provider_resources').where({ provider_id: providerId }).whereIn('node_id', toRemove).del();
      }

      await recordEvent({
        userId: actorId,
        action: 'provider.resources.update',
        resource: 'provider',
        resourceId: providerId,
        result: 'success',
        req,
        metadata: { added: toAdd, removed: toRemove },
        trx,
      });
    });

    return providerRepository.listResourcesForProvider(providerId);
  },
};
