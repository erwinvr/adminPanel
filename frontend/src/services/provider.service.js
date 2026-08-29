import { httpClient } from '../api/httpClient.js';

export const providerService = {
  list: () => httpClient.get('/providers'),
  create: (payload) => httpClient.post('/providers', payload),
  update: (id, payload) => httpClient.patch(`/providers/${id}`, payload),
  remove: (id) => httpClient.delete(`/providers/${id}`),
  setResources: (id, nodeIds) => httpClient.patch(`/providers/${id}/resources`, { nodeIds }),
};
