import { httpClient } from '../api/httpClient.js';

export const topologyService = {
  getGraph: () => httpClient.get('/topology'),
  createNode: (payload) => httpClient.post('/topology/nodes', payload),
  updateNode: (id, payload) => httpClient.patch(`/topology/nodes/${id}`, payload),
  deleteNode: (id) => httpClient.delete(`/topology/nodes/${id}`),
  createEdge: (payload) => httpClient.post('/topology/edges', payload),
  deleteEdge: (id) => httpClient.delete(`/topology/edges/${id}`),
};
