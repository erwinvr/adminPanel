import { httpClient } from '../api/httpClient.js';

export const permissionService = {
  list: () => httpClient.get('/permissions'),
};
