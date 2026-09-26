import { httpClient } from '../api/httpClient.js';

export const m365Service = {
  getSettings: () => httpClient.get('/m365/settings'),
  saveSettings: (payload) => httpClient.patch('/m365/settings', payload),
  sync: () => httpClient.post('/m365/sync', {}),
  getSyncStatus: () => httpClient.get('/m365/sync/status'),
  listLicenses: () => httpClient.get('/m365/licenses'),
  listUsers: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    return httpClient.getWithMeta(`/m365/users?${qs.toString()}`);
  },
  getServicesUsage: () => httpClient.get('/m365/services-usage'),
  getUsersSummary: () => httpClient.get('/m365/users/summary'),
};
