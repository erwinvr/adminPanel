/**
 * audit/audit.service.js
 *
 * ÚNICO punto de escritura hacia audit_logs en toda la aplicación. Los
 * demás services (auth, user, role) llaman a `recordEvent`, nunca
 * insertan en audit_logs directamente — así ningún endpoint nuevo puede
 * "olvidarse" de auditar de forma inconsistente con el resto.
 */

import { auditRepository } from '../repositories/audit.repository.js';
import { logger } from '../config/logger.js';

/**
 * @param {object} params
 * @param {string|null} params.userId - null si el actor no está autenticado (ej. login fallido con usuario inexistente)
 * @param {string} params.action - ej. 'auth.login', 'user.create'
 * @param {string} params.resource - ej. 'user', 'role'
 * @param {string|null} [params.resourceId]
 * @param {'success'|'failure'} params.result
 * @param {import('express').Request} [params.req] - de donde se extraen IP y user-agent
 * @param {object} [params.metadata]
 * @param {import('knex').Knex.Transaction} [params.trx] - para que el registro participe de la misma transacción que el cambio auditado
 */
export async function recordEvent({ userId = null, action, resource, resourceId = null, result, req, metadata, trx }) {
  const entry = {
    user_id: userId,
    action,
    resource,
    resource_id: resourceId,
    ip_address: req?.ip ?? null,
    user_agent: req?.headers?.['user-agent'] ?? null,
    result,
    metadata: metadata ? JSON.stringify(metadata) : null,
  };

  try {
    await auditRepository.insert(entry, trx);
  } catch (err) {
    // Un fallo al escribir auditoría NUNCA debe tumbar el request de
    // negocio que la originó de forma silenciosa e inexplicable para el
    // usuario — pero si `trx` fue provisto, sí debe propagar el error
    // para que la transacción completa haga rollback (ver comentario en
    // la migración: consistencia sobre disponibilidad para este caso).
    if (trx) throw err;
    logger.error({ err, entry }, 'No se pudo escribir el registro de auditoría (fuera de transacción)');
  }
}
