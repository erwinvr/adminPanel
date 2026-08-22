import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { closeDatabaseConnection } from '../../src/config/database.js';

describe('GET /api/health', () => {
  afterAll(async () => {
    await closeDatabaseConnection();
  });

  it('responde 200 con status ok cuando la base de datos está disponible', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.database).toBe('up');
  });

  it('responde en formato JSON consistente con el resto de la API', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toHaveProperty('data.timestamp');
  });
});

describe('GET /api/ruta-inexistente', () => {
  it('responde 404 con el formato de error estándar', async () => {
    const res = await request(app).get('/api/ruta-inexistente');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: expect.stringContaining('Ruta no encontrada'),
      },
    });
  });
});
