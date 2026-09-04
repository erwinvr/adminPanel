import { httpClient } from '../api/httpClient.js';

export const vaultService = {
  list: () => httpClient.get('/vault'),
  create: (payload) => httpClient.post('/vault', payload),
  update: (id, payload) => httpClient.patch(`/vault/${id}`, payload),
  remove: (id) => httpClient.delete(`/vault/${id}`),
  reveal: (id) => httpClient.post(`/vault/${id}/reveal`),
  linkedApplicationNodeIds: () => httpClient.get('/vault/linked-application-nodes'),
};
