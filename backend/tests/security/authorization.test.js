/**
 * tests/security/authorization.test.js
 *
 * Corresponde directamente a la sección 22 (Security tests) de los
 * requisitos: usuario sin autenticación, usuario autenticado sin
 * permisos, acceso directo a endpoints protegidos, modificación de
 * roles sin permiso.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestClient } from '../helpers/testClient.js';
import { closeDatabaseConnection } from '../../src/config/database.js';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;

let noPermsUsername;
const NO_PERMS_PASSWORD = 'ClaveSinPermisos123';

beforeAll(async () => {
  // Crea, vía el admin, un usuario SIN roles asignados — el caso de
  // "autenticado pero sin permisos" que piden probar explícitamente.
  const admin = createTestClient();
  await admin.login(ADMIN_USERNAME, ADMIN_PASSWORD);

  noPermsUsername = `sin.permisos.${Date.now()}`;
  const res = await admin.post('/api/users', {
    firstName: 'Sin',
    lastName: 'Permisos',
    username: noPermsUsername,
    email: `${noPermsUsername}@example.com`,
    initialPassword: NO_PERMS_PASSWORD,
    roleIds: [], // deliberadamente sin roles
  });
  expect(res.status).toBe(201);
});

afterAll(async () => {
  await closeDatabaseConnection();
});

describe('Acceso sin autenticación (401)', () => {
  const protectedEndpoints = [
    ['get', '/api/users'],
    ['get', '/api/roles'],
    ['get', '/api/permissions'],
    ['get', '/api/audit-logs'],
  ];

  it.each(protectedEndpoints)('%s %s devuelve 401 sin sesión', async (method, path) => {
    const client = createTestClient();
    const res = await client[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('POST /api/users sin sesión devuelve 401 (no solo 403 por CSRF)', async () => {
    const client = createTestClient();
    const res = await client.post('/api/users', { firstName: 'X' });
    // El middleware de authenticate corre antes que requirePermission,
    // así que sin sesión el resultado correcto es 401, no 403.
    expect(res.status).toBe(401);
  });
});

describe('Usuario autenticado SIN permisos suficientes (403)', () => {
  it('no puede listar usuarios', async () => {
    const client = createTestClient();
    await client.login(noPermsUsername, NO_PERMS_PASSWORD);

    const res = await client.get('/api/users');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('no puede crear usuarios', async () => {
    const client = createTestClient();
    await client.login(noPermsUsername, NO_PERMS_PASSWORD);

    const res = await client.post('/api/users', {
      firstName: 'No',
      lastName: 'Deberia',
      username: `intento.${Date.now()}`,
      email: `intento.${Date.now()}@example.com`,
      initialPassword: 'ClaveDePrueba123',
    });
    expect(res.status).toBe(403);
  });

  it('no puede modificar roles ni sus permisos', async () => {
    const client = createTestClient();
    await client.login(noPermsUsername, NO_PERMS_PASSWORD);

    const res = await client.post('/api/roles', { name: 'rol-no-autorizado', permissionIds: [] });
    expect(res.status).toBe(403);
  });

  it('no puede consultar auditoría', async () => {
    const client = createTestClient();
    await client.login(noPermsUsername, NO_PERMS_PASSWORD);

    const res = await client.get('/api/audit-logs');
    expect(res.status).toBe(403);
  });

  it('/api/auth/me SÍ es accesible (solo requiere autenticación, no un permiso)', async () => {
    const client = createTestClient();
    await client.login(noPermsUsername, NO_PERMS_PASSWORD);

    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.permissions).toEqual([]);
  });
});

describe('CSRF', () => {
  it('rechaza un POST autenticado sin token CSRF (403)', async () => {
    const client = createTestClient();
    await client.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const res = await client.post(
      '/api/users',
      {
        firstName: 'Sin',
        lastName: 'Csrf',
        username: `sincsrf.${Date.now()}`,
        email: `sincsrf.${Date.now()}@example.com`,
        initialPassword: 'ClaveDePrueba123',
      },
      { skipCsrf: true }
    );
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/CSRF/);
  });
});

describe('Mass assignment', () => {
  it('ignora campos no declarados en el schema (ej. intentar auto-asignarse status=active o un id)', async () => {
    const client = createTestClient();
    await client.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const username = `massassign.${Date.now()}`;
    const res = await client.post('/api/users', {
      firstName: 'Mass',
      lastName: 'Assign',
      username,
      email: `${username}@example.com`,
      initialPassword: 'ClaveDePrueba123',
      id: '11111111-1111-1111-1111-111111111111', // no debe poder forzar su propio ID
      status: 'active', // no es un campo aceptado en creación
      is_system: true, // campo que ni siquiera existe en users
    });

    expect(res.status).toBe(201);
    expect(res.body.data.id).not.toBe('11111111-1111-1111-1111-111111111111');
  });
});
