import { httpClient } from '../api/httpClient.js';

export const inventoryService = {
  list: () => httpClient.get('/inventory'),
  create: (payload) => httpClient.post('/inventory', payload),
  update: (id, payload) => httpClient.patch(`/inventory/${id}`, payload),
  remove: (id) => httpClient.delete(`/inventory/${id}`),
};
