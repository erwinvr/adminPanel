import { httpClient } from '../api/httpClient.js';

export const netbackupService = {
  listDevices: () => httpClient.get('/netbackup/devices'),
  listAvailableHardware: () => httpClient.get('/netbackup/devices/available'),
  createDevice: (payload) => httpClient.post('/netbackup/devices', payload),
  updateDevice: (id, payload) => httpClient.patch(`/netbackup/devices/${id}`, payload),
  removeDevice: (id) => httpClient.delete(`/netbackup/devices/${id}`),
  runNow: (id) => httpClient.post(`/netbackup/devices/${id}/run`, {}),
  listRuns: () => httpClient.get('/netbackup/runs'),
  getRunConfig: (id) => httpClient.get(`/netbackup/runs/${id}/config`),
  getConfigSummary: () => httpClient.get('/netbackup/devices/config-summary'),
  listDeviceVersions: (id) => httpClient.get(`/netbackup/devices/${id}/versions`),
  diffRuns: (fromId, toId) => httpClient.get(`/netbackup/runs/diff?from=${fromId}&to=${toId}`),
};
