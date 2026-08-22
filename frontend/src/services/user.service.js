import { httpClient } from '../api/httpClient.js';

export const userService = {
  list: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    return httpClient.getWithMeta(`/users?${qs.toString()}`);
  },
  get: (id) => httpClient.get(`/users/${id}`),
  create: (payload) => httpClient.post('/users', payload),
  update: (id, payload) => httpClient.patch(`/users/${id}`, payload),
  deactivate: (id) => httpClient.delete(`/users/${id}`),
};
