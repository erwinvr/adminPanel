import { httpClient } from '../api/httpClient.js';

export const auditService = {
  list: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    return httpClient.getWithMeta(`/audit-logs?${qs.toString()}`);
  },
};
