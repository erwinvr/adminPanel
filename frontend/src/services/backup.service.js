import { httpClient } from '../api/httpClient.js';

export const backupService = {
  getSettings: () => httpClient.get('/backups/settings'),
  saveSettings: (payload) => httpClient.patch('/backups/settings', payload),
  sync: () => httpClient.post('/backups/sync', {}),
  getDashboard: () => httpClient.get('/backups/dashboard'),
};
