import { httpClient } from '../api/httpClient.js';

const toQuery = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString();

export const reportService = {
  list: () => httpClient.get('/reports'),
  run: (key, params = {}) => httpClient.getWithMeta(`/reports/${key}?${toQuery(params)}`),
  // Exporta TODAS las filas que cumplen los filtros (sin page/pageSize).
  exportCsv: (key, { page, pageSize, ...filters }) => httpClient.download(`/reports/${key}/export?${toQuery(filters)}`),
};
