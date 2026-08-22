/**
 * server.js
 *
 * Punto de entrada del proceso. Levanta el servidor HTTP a partir de la
 * app ensamblada en src/app.js, verifica la conexión a base de datos al
 * arrancar, y maneja el apagado ordenado (graceful shutdown) ante señales
 * del sistema/orquestador de contenedores.
 */

import { app } from './src/app.js';
import { env } from './src/config/env.js';
import { logger } from './src/config/logger.js';
import { checkDatabaseConnection, closeDatabaseConnection } from './src/config/database.js';

async function start() {
  const databaseOk = await checkDatabaseConnection();
  if (!databaseOk) {
    logger.fatal('No se pudo establecer conexión inicial con la base de datos. Abortando arranque.');
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    logger.info(`Servidor escuchando en el puerto ${env.port} [${env.nodeEnv}]`);
  });

  const shutdown = async (signal) => {
    logger.info(`Señal ${signal} recibida. Iniciando apagado ordenado...`);
    server.close(async () => {
      await closeDatabaseConnection();
      logger.info('Apagado completo.');
      process.exit(0);
    });

    // Si el apagado ordenado tarda demasiado (conexiones colgadas), forzar salida.
    setTimeout(() => {
      logger.error('Apagado ordenado excedió el tiempo límite. Forzando salida.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled Promise Rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught Exception — el proceso se cerrará');
    process.exit(1);
  });
}

start();
