import { describe, it, expect, afterAll } from 'vitest';
import { createTestClient } from '../helpers/testClient.js';
import { closeDatabaseConnection } from '../../src/config/database.js';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;

describe('ABM de usuarios', () => {
  afterAll(async () => {
    await closeDatabaseConnection();
  });

  it('crea un usuario, lo lista y lo desactiva de punta a punta', async () => {
    const client = createTestClient();
    await client.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const username = `test.user.${Date.now()}`;
    const createRes = await client.post('/api/users', {
      firstName: 'Test',
      lastName: 'Usuario',
      username,
      email: `${username}@example.com`,
      initialPassword: 'ClaveDePrueba123',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.username).toBe(username);
    expect(createRes.body.data).not.toHaveProperty('password_hash');
    const userId = createRes.body.data.id;

    const listRes = await client.get(`/api/users?search=${username}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((u) => u.id === userId)).toBe(true);

    const deactivateRes = await client.delete(`/api/users/${userId}`);
    expect(deactivateRes.status).toBe(204);

    const getRes = await client.get(`/api/users/${userId}`);
    expect(getRes.body.data.status).toBe('inactive');
  });

  it('rechaza crear un usuario con username/email duplicado (409)', async () => {
    const client = createTestClient();
    await client.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const res = await client.post('/api/users', {
      firstName: 'Dup',
      lastName: 'Licado',
      username: ADMIN_USERNAME, // ya existe
      email: 'otro-email-unico@example.com',
      initialPassword: 'ClaveDePrueba123',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rechaza una contraseña inicial que no cumple la política (422)', async () => {
    const client = createTestClient();
    await client.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const res = await client.post('/api/users', {
      firstName: 'Debil',
      lastName: 'Password',
      username: `weakpass.${Date.now()}`,
      email: `weakpass.${Date.now()}@example.com`,
      initialPassword: 'corta',
    });

    expect(res.status).toBe(422);
  });

  it('no permite que un usuario se desactive a sí mismo', async () => {
    const client = createTestClient();
    const loginRes = await client.login(ADMIN_USERNAME, ADMIN_PASSWORD);
    const selfId = loginRes.body.data.id;

    const res = await client.delete(`/api/users/${selfId}`);
    expect(res.status).toBe(422);
  });
});
