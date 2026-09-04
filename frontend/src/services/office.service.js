import { httpClient } from '../api/httpClient.js';

export const officeService = {
  list: () => httpClient.get('/offices'),
  create: (payload) => httpClient.post('/offices', payload),
  update: (id, payload) => httpClient.patch(`/offices/${id}`, payload),
  remove: (id) => httpClient.delete(`/offices/${id}`),
};
