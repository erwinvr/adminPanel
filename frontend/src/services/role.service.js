import { httpClient } from '../api/httpClient.js';

export const roleService = {
  list: () => httpClient.get('/roles'),
  get: (id) => httpClient.get(`/roles/${id}`),
  create: (payload) => httpClient.post('/roles', payload),
  update: (id, payload) => httpClient.patch(`/roles/${id}`, payload),
  remove: (id) => httpClient.delete(`/roles/${id}`),
};
