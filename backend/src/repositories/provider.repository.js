import { db } from '../config/database.js';

const PROVIDER_COLUMNS = ['id', 'name', 'contact_email as contactEmail', 'contact_phone as contactPhone', 'notes'];

export const providerRepository = {
  listProviders() {
    return db('providers').select(PROVIDER_COLUMNS).orderBy('name');
  },

  findProviderById(id) {
    return db('providers').where({ id }).first();
  },

  // Trae de una sola consulta los vínculos de TODOS los proveedores —
  // se combina en memoria con listProviders() en el service, igual que
  // topology.service.js hace con nodes/edges.
  listAllLinks() {
    return db('provider_resources as pr')
      .join('topology_nodes as n', 'n.id', 'pr.node_id')
      .select('pr.provider_id as providerId', 'n.id as id', 'n.name as name', 'n.column_index as col')
      .orderBy('n.name');
  },

  listResourcesForProvider(providerId) {
    return db('provider_resources as pr')
      .join('topology_nodes as n', 'n.id', 'pr.node_id')
      .where('pr.provider_id', providerId)
      .select('n.id', 'n.name', 'n.column_index as col')
      .orderBy('n.name');
  },

  listResourceIds(providerId) {
    return db('provider_resources').where({ provider_id: providerId }).pluck('node_id');
  },

  removeResourceLinks(providerId, nodeIds) {
    return db('provider_resources').where({ provider_id: providerId }).whereIn('node_id', nodeIds).del();
  },
};
