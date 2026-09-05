import { httpClient } from '../api/httpClient.js';

export const complianceService = {
  listRules: () => httpClient.get('/netbackup/compliance/rules'),
  createRule: (payload) => httpClient.post('/netbackup/compliance/rules', payload),
  updateRule: (id, payload) => httpClient.patch(`/netbackup/compliance/rules/${id}`, payload),
  removeRule: (id) => httpClient.delete(`/netbackup/compliance/rules/${id}`),
  getSummary: () => httpClient.get('/netbackup/compliance/summary'),
  getDeviceResults: (id) => httpClient.get(`/netbackup/compliance/devices/${id}`),
};
