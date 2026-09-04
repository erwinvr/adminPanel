import { httpClient } from '../api/httpClient.js';

export const shareService = {
  getStatus: (dashboardKey) => httpClient.get(`/shares/${dashboardKey}`),
  create: (dashboardKey) => httpClient.post(`/shares/${dashboardKey}`, {}),
  revoke: (dashboardKey) => httpClient.delete(`/shares/${dashboardKey}`),
  // Sin sesión — la usa la página pública (PublicDashboardPage.jsx), no
  // pasa por AuthContext ni espera la cookie de sesión para nada.
  getPublicDashboard: (token) => httpClient.get(`/public/dashboards/${token}`),
};
