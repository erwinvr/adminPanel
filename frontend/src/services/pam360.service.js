import { httpClient } from '../api/httpClient.js';

export const pam360Service = {
  getSettings: () => httpClient.get('/pam360/settings'),
  saveSettings: (payload) => httpClient.patch('/pam360/settings', payload),
  sync: () => httpClient.post('/pam360/sync', {}),
  listAccessRequests: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    return httpClient.getWithMeta(`/pam360/access-requests?${qs.toString()}`);
  },
};
