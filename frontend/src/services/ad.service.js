import { httpClient } from '../api/httpClient.js';

export const adService = {
  getSettings: () => httpClient.get('/ad/settings'),
  saveSettings: (payload) => httpClient.patch('/ad/settings', payload),
  sync: () => httpClient.post('/ad/sync', {}),
  listUsers: () => httpClient.get('/ad/users'),
};
