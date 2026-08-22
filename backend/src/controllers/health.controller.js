/**
 * controllers/health.controller.js
 *
 * Controller deliberadamente delgado: no contiene lógica de negocio,
 * solo delega la verificación real a la capa de config/database y arma
 * la respuesta HTTP. Sirve como healthcheck para Docker/orquestación y
 * como verificación manual rápida de que la API y la BD responden.
 */

import { checkDatabaseConnection } from '../config/database.js';

export async function getHealth(req, res) {
  const databaseOk = await checkDatabaseConnection();

  const body = {
    success: true,
    data: {
      status: databaseOk ? 'ok' : 'degraded',
      database: databaseOk ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    },
  };

  // 200 si todo está bien; 503 si la BD no responde (para que un
  // healthcheck de Docker/orquestador marque el contenedor como no-listo).
  res.status(databaseOk ? 200 : 503).json(body);
}
