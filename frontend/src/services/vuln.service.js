import { httpClient } from '../api/httpClient.js';

export const vulnService = {
  getSettings: () => httpClient.get('/vuln/settings'),
  saveSettings: (payload) => httpClient.patch('/vuln/settings', payload),
  sync: () => httpClient.post('/vuln/sync', {}),
  getDashboard: () => httpClient.get('/vuln/dashboard'),
};
