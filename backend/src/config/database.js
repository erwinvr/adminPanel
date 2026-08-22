/**
 * config/database.js
 *
 * Instancia única de Knex usada en runtime por toda la aplicación
 * (repositories). Distinta de knexfile.js, que solo usa el CLI para
 * migraciones/seeds.
 *
 * El pool de conexiones (min 2 / max 20) está dimensionado para ~100
 * usuarios concurrentes en un único proceso Node; si en el futuro se
 * escala a múltiples réplicas del backend, este máximo debe reconsiderarse
 * en conjunto con `max_connections` de PostgreSQL.
 */

import knexLib from 'knex';
import { env } from './env.js';
import { logger } from './logger.js';

export const db = knexLib({
  client: 'pg',
  connection: env.databaseUrl,
  pool: {
    min: 2,
    max: 20,
    afterCreate: (conn, done) => {
      // Aplica un timeout de sentencia a nivel de conexión: ninguna consulta
      // individual puede colgar el proceso indefinidamente.
      conn.query('SET statement_timeout = 10000;', (err) => done(err, conn));
    },
  },
});

/**
 * Verifica que la base de datos esté accesible. Se usa en el arranque del
 * servidor y en el endpoint de health check.
 * @returns {Promise<boolean>}
 */
export async function checkDatabaseConnection() {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch (err) {
    logger.error({ err }, 'No se pudo conectar a la base de datos');
    return false;
  }
}

/**
 * Cierra el pool de conexiones de forma ordenada (usado en shutdown).
 */
export async function closeDatabaseConnection() {
  await db.destroy();
}
