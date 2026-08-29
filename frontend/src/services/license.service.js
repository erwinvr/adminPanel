import { httpClient } from '../api/httpClient.js';

export const licenseService = {
  list: () => httpClient.get('/licenses'),
  create: (payload) => httpClient.post('/licenses', payload),
  update: (id, payload) => httpClient.patch(`/licenses/${id}`, payload),
  remove: (id) => httpClient.delete(`/licenses/${id}`),
};
