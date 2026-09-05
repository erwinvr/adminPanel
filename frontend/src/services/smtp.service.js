import { httpClient } from '../api/httpClient.js';

export const smtpService = {
  getSettings: () => httpClient.get('/smtp/settings'),
  saveSettings: (payload) => httpClient.patch('/smtp/settings', payload),
  sendTestEmail: (to) => httpClient.post('/smtp/test', { to }),
};
