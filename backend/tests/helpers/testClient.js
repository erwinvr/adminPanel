/**
 * tests/helpers/testClient.js
 *
 * Envuelve supertest con manejo de cookies (sesión + CSRF) entre
 * requests, para no repetir ese plomeria en cada archivo de test.
 */

import request from 'supertest';
import { app } from '../../src/app.js';

function extractCookie(res, name) {
  const raw = res.headers['set-cookie'] ?? [];
  const match = raw.find((c) => c.startsWith(`${name}=`));
  return match ? match.split(';')[0] : null;
}

export function createTestClient() {
  let sessionCookie = null;
  let csrfCookie = null;
  let csrfToken = null;

  function cookieHeader() {
    return [sessionCookie, csrfCookie].filter(Boolean).join('; ');
  }

  function captureCookies(res) {
    const sid = extractCookie(res, process.env.SESSION_COOKIE_NAME || 'sid');
    const csrf = extractCookie(res, 'csrf_token');
    if (sid) sessionCookie = sid;
    if (csrf) {
      csrfCookie = csrf;
      csrfToken = csrf.split('=')[1];
    }
  }

  return {
    async ensureCsrf() {
      if (csrfToken) return csrfToken;
      const res = await request(app).get('/api/health');
      captureCookies(res);
      return csrfToken;
    },

    async login(identifier, password) {
      await this.ensureCsrf();
      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', cookieHeader())
        .set('X-CSRF-Token', csrfToken)
        .send({ identifier, password });
      captureCookies(res);
      return res;
    },

    async get(path) {
      const res = await request(app).get(path).set('Cookie', cookieHeader());
      captureCookies(res);
      return res;
    },

    async post(path, body, { skipCsrf = false } = {}) {
      await this.ensureCsrf();
      const req = request(app).post(path).set('Cookie', cookieHeader()).send(body ?? {});
      if (!skipCsrf) req.set('X-CSRF-Token', csrfToken);
      const res = await req;
      captureCookies(res);
      return res;
    },

    async patch(path, body) {
      await this.ensureCsrf();
      const res = await request(app)
        .patch(path)
        .set('Cookie', cookieHeader())
        .set('X-CSRF-Token', csrfToken)
        .send(body ?? {});
      captureCookies(res);
      return res;
    },

    async delete(path) {
      await this.ensureCsrf();
      const res = await request(app).delete(path).set('Cookie', cookieHeader()).set('X-CSRF-Token', csrfToken);
      captureCookies(res);
      return res;
    },
  };
}
