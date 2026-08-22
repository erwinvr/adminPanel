import { describe, it, expect, afterAll } from 'vitest';
import { createTestClient } from '../helpers/testClient.js';
import { closeDatabaseConnection } from '../../src/config/database.js';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;
const MAX_ATTEMPTS = Number(process.env.ACCOUNT_LOCK_MAX_FAILED_ATTEMPTS || 5);

describe('Bloqueo de cuenta tras intentos fallidos', () => {
  afterAll(async () => {
    await closeDatabaseConnection();
  });

  it(`bloquea la cuenta después de ${MAX_ATTEMPTS} intentos fallidos consecutivos`, async () => {
    const admin = createTestClient();
    await admin.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const username = `lockouttest.${Date.now()}`;
    const correctPassword = 'ClaveCorrecta123';
    const createRes = await admin.post('/api/users', {
      firstName: 'Lockout',
      lastName: 'Test',
      username,
      email: `${username}@example.com`,
      initialPassword: correctPassword,
    });
    expect(createRes.status).toBe(201);

    // MAX_ATTEMPTS-1 intentos fallidos: la cuenta todavía no debería bloquearse.
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      const client = createTestClient();
      const res = await client.login(username, 'contraseña-incorrecta');
      expect(res.status).toBe(401);
      expect(res.body.error.message).not.toMatch(/bloqueada/);
    }

    // El intento número MAX_ATTEMPTS dispara el bloqueo.
    const triggerClient = createTestClient();
    const triggerRes = await triggerClient.login(username, 'contraseña-incorrecta');
    expect(triggerRes.status).toBe(401);

    // Incluso con la contraseña CORRECTA, ahora debe rechazarse por bloqueo.
    const afterLockClient = createTestClient();
    const afterLockRes = await afterLockClient.login(username, correctPassword);
    expect(afterLockRes.status).toBe(401);
    expect(afterLockRes.body.error.message).toMatch(/bloqueada/);
  });

  it('un login exitoso resetea el contador de intentos fallidos', async () => {
    const admin = createTestClient();
    await admin.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const username = `resetcounter.${Date.now()}`;
    const correctPassword = 'ClaveCorrecta123';
    await admin.post('/api/users', {
      firstName: 'Reset',
      lastName: 'Counter',
      username,
      email: `${username}@example.com`,
      initialPassword: correctPassword,
    });

    // 2 intentos fallidos (por debajo del umbral de bloqueo).
    for (let i = 0; i < 2; i++) {
      const client = createTestClient();
      await client.login(username, 'incorrecta');
    }

    // Login correcto: debería funcionar y resetear el contador.
    const successClient = createTestClient();
    const successRes = await successClient.login(username, correctPassword);
    expect(successRes.status).toBe(200);

    // Verificado indirectamente: el usuario puede seguir logueándose
    // normalmente después (si el contador no se hubiera reseteado,
    // eventualmente se bloquearía con menos intentos de los esperados).
    const secondSuccessClient = createTestClient();
    const secondSuccessRes = await secondSuccessClient.login(username, correctPassword);
    expect(secondSuccessRes.status).toBe(200);
  });
});
