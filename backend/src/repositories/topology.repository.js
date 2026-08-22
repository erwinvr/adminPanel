import { db } from '../config/database.js';

export const topologyRepository = {
  listNodes() {
    return db('topology_nodes')
      .select('id', 'column_index as col', 'name', 'sub', 'color')
      .orderBy(['column_index', 'created_at']);
  },

  listEdges() {
    return db('topology_edges').select(
      'id',
      'from_node_id as from',
      'to_node_id as to'
    );
  },

  findNodeById(id) {
    return db('topology_nodes').where({ id }).first();
  },

  countNodesInColumn(columnIndex) {
    return db('topology_nodes')
      .where({ column_index: columnIndex })
      .count({ count: '*' })
      .first()
      .then((r) => Number(r.count));
  },

  createNode({ columnIndex, name, sub, color, actorId }) {
    return db('topology_nodes')
      .insert({
        column_index: columnIndex,
        name,
        sub: sub || null,
        color: color || null,
        created_by: actorId,
        updated_by: actorId,
      })
      .returning(['id', 'column_index as col', 'name', 'sub', 'color'])
      .then(([row]) => row);
  },

  updateNode(id, changes, actorId) {
    return db('topology_nodes')
      .where({ id })
      .update({ ...changes, updated_by: actorId, updated_at: db.fn.now() })
      .returning(['id', 'column_index as col', 'name', 'sub', 'color'])
      .then(([row]) => row);
  },

  deleteNode(id) {
    return db('topology_nodes').where({ id }).del();
  },

  edgeExists(fromNodeId, toNodeId) {
    return db('topology_edges')
      .where({ from_node_id: fromNodeId, to_node_id: toNodeId })
      .first()
      .then(Boolean);
  },

  createEdge({ fromNodeId, toNodeId, actorId }) {
    return db('topology_edges')
      .insert({ from_node_id: fromNodeId, to_node_id: toNodeId, created_by: actorId })
      .returning(['id', 'from_node_id as from', 'to_node_id as to'])
      .then(([row]) => row);
  },

  findEdgeById(id) {
    return db('topology_edges').where({ id }).first();
  },

  deleteEdge(id) {
    return db('topology_edges').where({ id }).del();
  },

  countAllNodes() {
    return db('topology_nodes').count({ count: '*' }).first().then((r) => Number(r.count));
  },
};
