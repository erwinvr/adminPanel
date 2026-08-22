/**
 * auth/session.js
 *
 * Configuración del middleware de sesión (express-session + store en
 * PostgreSQL vía connect-pg-simple). Se usa la misma pool de conexiones
 * de Knex (db.client.pool) en vez de abrir una segunda conexión separada
 * a la base de datos solo para sesiones.
 */

import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { env } from '../config/env.js';

const PgSession = connectPgSimple(session);

export function createSessionMiddleware() {
  return session({
    store: new PgSession({
      // connect-pg-simple necesita un pool NATIVO de `pg` (usa `.query()`
      // directamente) — el pool interno de Knex usa `tarn` para pooling y
      // NO expone esa misma interfaz, así que no se puede reutilizar
      // directamente. Se le da su propia cadena de conexión: abre un pool
      // pequeño y separado, dimensionado solo para sesiones.
      conString: env.databaseUrl,
      tableName: 'sessions',
      createTableIfMissing: false, // la tabla se crea vía migración, no en runtime
    }),
    name: env.session.cookieName,
    secret: env.session.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // renueva el tiempo de expiración en cada request autenticado
    cookie: {
      httpOnly: true,
      secure: env.isProduction, // 'true' exige HTTPS — nginx lo termina en producción
      sameSite: 'strict',
      maxAge: env.session.maxAgeMs,
    },
  });
}

/**
 * Regenera el ID de sesión preservando los datos que se le pasen.
 * Previene session fixation: after login, siempre se llama a esto antes
 * de escribir el usuario autenticado en la sesión.
 * @param {import('express').Request} req
 * @returns {Promise<void>}
 */
export function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Destruye la sesión actual (logout).
 * @param {import('express').Request} req
 * @returns {Promise<void>}
 */
export function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}
