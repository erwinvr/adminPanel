import { describe, it, expect, afterAll } from 'vitest';
import { createTestClient } from '../helpers/testClient.js';
import { closeDatabaseConnection } from '../../src/config/database.js';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;

describe('Autenticación', () => {
  afterAll(async () => {
    await closeDatabaseConnection();
  });

  it('rechaza login con credenciales inexistentes con mensaje genérico', async () => {
    const client = createTestClient();
    const res = await client.login('usuario_que_no_existe', 'cualquiera');

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Usuario o contraseña incorrectos');
  });

  it('rechaza login con contraseña incorrecta con el MISMO mensaje que usuario inexistente (anti user-enumeration)', async () => {
    const client = createTestClient();
    const res = await client.login(ADMIN_USERNAME, 'contraseña-incorrecta');

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Usuario o contraseña incorrectos');
  });

  it('acepta login con credenciales correctas y devuelve permisos efectivos', async () => {
    const client = createTestClient();
    const res = await client.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe(ADMIN_USERNAME);
    expect(Array.isArray(res.body.data.permissions)).toBe(true);
    expect(res.body.data.permissions).toContain('users.view');
    expect(res.body.data).not.toHaveProperty('password_hash');
  });

  it('GET /api/auth/me sin sesión devuelve 401', async () => {
    const client = createTestClient();
    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /api/auth/me con sesión válida devuelve el usuario actual', async () => {
    const client = createTestClient();
    await client.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe(ADMIN_USERNAME);
  });

  it('logout invalida la sesión: /me vuelve a dar 401 después', async () => {
    const client = createTestClient();
    await client.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const logoutRes = await client.post('/api/auth/logout');
    expect(logoutRes.status).toBe(204);

    const meRes = await client.get('/api/auth/me');
    expect(meRes.status).toBe(401);
  });

  it('cambiar la contraseña invalida OTRAS sesiones activas del mismo usuario', async () => {
    // Se crea un usuario de prueba dedicado (no se usa el admin, para no
    // dejar la contraseña del admin real cambiada entre tests).
    const admin = createTestClient();
    await admin.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const username = `sessiontest.${Date.now()}`;
    const originalPassword = 'ClaveOriginal123';
    const createRes = await admin.post('/api/users', {
      firstName: 'Session',
      lastName: 'Test',
      username,
      email: `${username}@example.com`,
      initialPassword: originalPassword,
    });
    expect(createRes.status).toBe(201);

    // Dos "dispositivos" (sesiones) distintos con el mismo usuario.
    const deviceA = createTestClient();
    const deviceB = createTestClient();
    await deviceA.login(username, originalPassword);
    await deviceB.login(username, originalPassword);

    // Ambos deberían estar autenticados antes del cambio.
    expect((await deviceA.get('/api/auth/me')).status).toBe(200);
    expect((await deviceB.get('/api/auth/me')).status).toBe(200);

    // deviceA cambia su propia contraseña.
    const changeRes = await deviceA.post('/api/auth/change-password', {
      currentPassword: originalPassword,
      newPassword: 'ClaveNueva456',
    });
    expect(changeRes.status).toBe(204);

    // deviceA sigue autenticado (es la sesión "actual", se preserva).
    expect((await deviceA.get('/api/auth/me')).status).toBe(200);
    // deviceB quedó invalidado.
    expect((await deviceB.get('/api/auth/me')).status).toBe(401);
  });
});
