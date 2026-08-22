/**
 * config/knexfile.js
 *
 * Configuración usada por el CLI de Knex (migraciones y seeds).
 * Es un archivo separado de database.js porque el CLI de Knex espera un
 * `module.exports` (o `export default`) con esta forma específica, distinta
 * de la instancia de conexión que usa el resto de la aplicación.
 */

import { env } from './env.js';

/** @type {import('knex').Knex.Config} */
export default {
  client: 'pg',
  connection: env.databaseUrl,
  migrations: {
    directory: '../../../database/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: '../../../database/seeds',
  },
  pool: {
    min: 2,
    max: 20,
  },
};
