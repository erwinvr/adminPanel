import { httpClient } from '../api/httpClient.js';

export const authService = {
  login: (identifier, password) => httpClient.post('/auth/login', { identifier, password }),
  logout: () => httpClient.post('/auth/logout', {}),
  me: () => httpClient.get('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    httpClient.post('/auth/change-password', { currentPassword, newPassword }),
};
