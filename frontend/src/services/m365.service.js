import { httpClient } from '../api/httpClient.js';

export const m365Service = {
  getSettings: () => httpClient.get('/m365/settings'),
  saveSettings: (payload) => httpClient.patch('/m365/settings', payload),
  sync: () => httpClient.post('/m365/sync', {}),
  listLicenses: () => httpClient.get('/m365/licenses'),
  listUsers: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    return httpClient.getWithMeta(`/m365/users?${qs.toString()}`);
  },
  getUsersSummary: () => httpClient.get('/m365/users/summary'),
};
