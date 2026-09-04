import { httpClient } from '../api/httpClient.js';

export const insightsService = {
  getUserSecurityInsights: () => httpClient.get('/insights/user-security'),
};
