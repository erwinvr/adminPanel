/**
 * services/topology.service.js
 *
 * Mapa de topología (Criticidad → Aplicación → Base de Datos →
 * Servidor → Datacenter/Nube), reemplazando el almacenamiento en el
 * navegador del artifact original por PostgreSQL — es un recurso
 * COMPARTIDO por todo el equipo (no por usuario), consistente con el
 * propósito original de la herramienta.
 */

import { db } from '../config/database.js';
import { topologyRepository } from '../repositories/topology.repository.js';
import { recordEvent } from '../audit/audit.service.js';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';

const MAX_COLUMN_INDEX = 4;

export const topologyService = {
  async getGraph() {
    const [nodes, edges] = await Promise.all([topologyRepository.listNodes(), topologyRepository.listEdges()]);
    return { nodes, edges };
  },

  async createNode(req, { columnIndex, name, sub, color }) {
    if (columnIndex < 0 || columnIndex > MAX_COLUMN_INDEX) {
      throw new ValidationError('Columna fuera de rango');
    }
    const actorId = req.session.userId;

    const node = await db.transaction(async (trx) => {
      const [created] = await trx('topology_nodes')
        .insert({
          column_index: columnIndex,
          name,
          sub: sub || null,
          color: color || null,
          created_by: actorId,
          updated_by: actorId,
        })
        .returning(['id', 'column_index as col', 'name', 'sub', 'color']);

      await recordEvent({
        userId: actorId,
        action: 'topology.node.create',
        resource: 'topology_node',
        resourceId: created.id,
        result: 'success',
        req,
        metadata: { name, columnIndex },
        trx,
      });
      return created;
    });

    return node;
  },

  async updateNode(req, id, changes) {
    const existing = await topologyRepository.findNodeById(id);
    if (!existing) throw new NotFoundError('Nodo no encontrado');

    const actorId = req.session.userId;
    const dbChanges = {};
    if (changes.name !== undefined) dbChanges.name = changes.name;
    if (changes.sub !== undefined) dbChanges.sub = changes.sub || null;
    if (changes.color !== undefined) dbChanges.color = changes.color || null;

    const updated = await db.transaction(async (trx) => {
      const result = await trx('topology_nodes')
        .where({ id })
        .update({ ...dbChanges, updated_by: actorId, updated_at: trx.fn.now() })
        .returning(['id', 'column_index as col', 'name', 'sub', 'color'])
        .then(([row]) => row);

      await recordEvent({
        userId: actorId,
        action: 'topology.node.update',
        resource: 'topology_node',
        resourceId: id,
        result: 'success',
        req,
        metadata: { changes: Object.keys(changes) },
        trx,
      });

      return result;
    });

    return updated;
  },

  async deleteNode(req, id) {
    const existing = await topologyRepository.findNodeById(id);
    if (!existing) throw new NotFoundError('Nodo no encontrado');

    const actorId = req.session.userId;

    await db.transaction(async (trx) => {
      await trx('topology_nodes').where({ id }).del(); // ON DELETE CASCADE borra sus conexiones
      await recordEvent({
        userId: actorId,
        action: 'topology.node.delete',
        resource: 'topology_node',
        resourceId: id,
        result: 'success',
        req,
        metadata: { name: existing.name },
        trx,
      });
    });
  },

  async createEdge(req, { fromNodeId, toNodeId }) {
    if (fromNodeId === toNodeId) {
      throw new ValidationError('Un nodo no puede conectarse consigo mismo');
    }
    const [from, to] = await Promise.all([
      topologyRepository.findNodeById(fromNodeId),
      topologyRepository.findNodeById(toNodeId),
    ]);
    if (!from || !to) throw new NotFoundError('Alguno de los nodos no existe');

    const exists = await topologyRepository.edgeExists(fromNodeId, toNodeId);
    if (exists) throw new ConflictError('Esa conexión ya existe');

    const actorId = req.session.userId;

    const edge = await db.transaction(async (trx) => {
      const created = await trx('topology_edges')
        .insert({ from_node_id: fromNodeId, to_node_id: toNodeId, created_by: actorId })
        .returning(['id', 'from_node_id as from', 'to_node_id as to'])
        .then(([row]) => row);

      await recordEvent({
        userId: actorId,
        action: 'topology.edge.create',
        resource: 'topology_edge',
        resourceId: created.id,
        result: 'success',
        req,
        metadata: { fromNodeId, toNodeId },
        trx,
      });

      return created;
    });

    return edge;
  },

  async deleteEdge(req, id) {
    const existing = await topologyRepository.findEdgeById(id);
    if (!existing) throw new NotFoundError('Conexión no encontrada');

    const actorId = req.session.userId;

    await db.transaction(async (trx) => {
      await trx('topology_edges').where({ id }).del();
      await recordEvent({
        userId: actorId,
        action: 'topology.edge.delete',
        resource: 'topology_edge',
        resourceId: id,
        result: 'success',
        req,
        trx,
      });
    });
  },
};
