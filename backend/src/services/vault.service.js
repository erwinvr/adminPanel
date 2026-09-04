/**
 * services/vault.service.js
 *
 * Bóveda de contraseñas: credenciales de aplicaciones (vinculadas a una
 * caja "Aplicación" del mapa de topología) o de dispositivos
 * (vinculadas a un ítem de Inventarios). El secreto se cifra antes de
 * guardarse (utils/crypto.js) y NUNCA viaja en el listado — solo
 * `revealSecret` lo descifra, y cada uso queda auditado (acceso a un
 * secreto es en sí mismo un evento sensible, a diferencia de un simple
 * "view").
 */

import { db } from '../config/database.js';
import { vaultRepository } from '../repositories/vault.repository.js';
import { topologyRepository } from '../repositories/topology.repository.js';
import { inventoryRepository } from '../repositories/inventory.repository.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { recordEvent } from '../audit/audit.service.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

const APPLICATION_COLUMN_INDEX = 1;

async function assertApplicationNode(nodeId) {
  const node = await topologyRepository.findNodeById(nodeId);
  if (!node) throw new NotFoundError('La aplicación seleccionada no existe');
  if (node.column_index !== APPLICATION_COLUMN_INDEX) {
    throw new ValidationError('El destino debe ser una caja de categoría "Aplicación"');
  }
}

async function assertHardwareExists(hardwareId) {
  const item = await inventoryRepository.findItemById(hardwareId);
  if (!item) throw new NotFoundError('El dispositivo seleccionado no existe');
}

export const vaultService = {
  listCredentials() {
    return vaultRepository.listCredentials();
  },

  listLinkedApplicationNodeIds() {
    return vaultRepository.listLinkedApplicationNodeIds();
  },

  async createCredential(req, { type, name, username, secret, notes, targetNodeId, targetHardwareId }) {
    if (type === 'application') await assertApplicationNode(targetNodeId);
    else await assertHardwareExists(targetHardwareId);

    const actorId = req.session.userId;
    const secretEncrypted = encryptSecret(secret);

    const created = await db.transaction(async (trx) => {
      const [row] = await trx('vault_credentials')
        .insert({
          type,
          name,
          username: username || null,
          secret_encrypted: secretEncrypted,
          notes: notes || null,
          target_node_id: type === 'application' ? targetNodeId : null,
          target_hardware_id: type === 'device' ? targetHardwareId : null,
          created_by: actorId,
          updated_by: actorId,
        })
        .returning(['id']);

      // El secreto NUNCA entra en los metadatos de auditoría, ni
      // siquiera cifrado — el audit log no es el lugar para guardar
      // material sensible, aunque esté cifrado en otra columna.
      await recordEvent({
        userId: actorId,
        action: 'vault.create',
        resource: 'vault_credential',
        resourceId: row.id,
        result: 'success',
        req,
        metadata: { type, name },
        trx,
      });

      return row;
    });

    const all = await vaultRepository.listCredentials();
    return all.find((c) => c.id === created.id);
  },

  async updateCredential(req, id, changes) {
    const existing = await vaultRepository.findCredentialById(id);
    if (!existing) throw new NotFoundError('Credencial no encontrada');

    if (changes.targetNodeId !== undefined) {
      if (existing.type !== 'application') throw new ValidationError('Esta credencial no es de tipo aplicación');
      await assertApplicationNode(changes.targetNodeId);
    }
    if (changes.targetHardwareId !== undefined) {
      if (existing.type !== 'device') throw new ValidationError('Esta credencial no es de tipo dispositivo');
      await assertHardwareExists(changes.targetHardwareId);
    }

    const actorId = req.session.userId;
    const dbChanges = {};
    if (changes.name !== undefined) dbChanges.name = changes.name;
    if (changes.username !== undefined) dbChanges.username = changes.username || null;
    if (changes.notes !== undefined) dbChanges.notes = changes.notes || null;
    if (changes.targetNodeId !== undefined) dbChanges.target_node_id = changes.targetNodeId;
    if (changes.targetHardwareId !== undefined) dbChanges.target_hardware_id = changes.targetHardwareId;
    if (changes.secret !== undefined) dbChanges.secret_encrypted = encryptSecret(changes.secret);

    await db.transaction(async (trx) => {
      await trx('vault_credentials')
        .where({ id })
        .update({ ...dbChanges, updated_by: actorId, updated_at: trx.fn.now() });

      await recordEvent({
        userId: actorId,
        action: 'vault.update',
        resource: 'vault_credential',
        resourceId: id,
        result: 'success',
        req,
        // Se audita QUÉ campos cambiaron, nunca los valores — ídem alta.
        metadata: { changes: Object.keys(changes) },
        trx,
      });
    });

    const all = await vaultRepository.listCredentials();
    return all.find((c) => c.id === id);
  },

  async deleteCredential(req, id) {
    const existing = await vaultRepository.findCredentialById(id);
    if (!existing) throw new NotFoundError('Credencial no encontrada');

    const actorId = req.session.userId;

    await db.transaction(async (trx) => {
      await trx('vault_credentials').where({ id }).del();
      await recordEvent({
        userId: actorId,
        action: 'vault.delete',
        resource: 'vault_credential',
        resourceId: id,
        result: 'success',
        req,
        metadata: { type: existing.type, name: existing.name },
        trx,
      });
    });
  },

  async revealSecret(req, id) {
    const existing = await vaultRepository.findCredentialById(id);
    if (!existing) throw new NotFoundError('Credencial no encontrada');

    const actorId = req.session.userId;
    // Cada revelado del secreto queda auditado con quién y cuándo —
    // es el evento más sensible de todo este módulo.
    await recordEvent({
      userId: actorId,
      action: 'vault.reveal',
      resource: 'vault_credential',
      resourceId: id,
      result: 'success',
      req,
      metadata: { type: existing.type, name: existing.name },
    });

    return decryptSecret(existing.secret_encrypted);
  },
};
