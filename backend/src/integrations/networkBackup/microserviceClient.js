/**
 * integrations/networkBackup/microserviceClient.js
 *
 * Cliente del microservicio `netbackup-agent` (Python/FastAPI, ver
 * netbackup-agent/) — resuelve los drivers que NAPALM/las APIs REST de
 * cada fabricante manejan mejor que un exec SSH crudo: `napalm_ios`
 * (Cisco IOS/IOS-XE) y `fortios_api` (FortiGate/FortiOS). El driver
 * `raw_ssh` sigue resolviéndose en Node mismo — ver sshClient.js.
 *
 * Solo alcanzable en la red interna de Docker Compose (mismo modelo de
 * confianza que la base de datos) — no hace falta autenticar esta
 * llamada, la autenticación/autorización del usuario final ya se
 * resolvió antes de llegar acá (ver netbackup.service.js#runBackup).
 */

import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';

const REQUEST_TIMEOUT_MS = 25000; // un poco más que el timeout interno de 20s del microservicio, para no cortar antes que él

export class NetbackupMicroserviceError extends AppError {
  constructor(message) {
    super(message, 502, 'NETBACKUP_MICROSERVICE_FAILED');
  }
}

/**
 * @param {{ driver: 'napalm_ios' | 'fortios_api', host: string, port: number, username: string, password: string }} params
 * @returns {Promise<string>} configuración completa como texto
 */
export async function fetchConfigViaMicroservice({ driver, host, port, username, password }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${env.netbackupMicroserviceUrl}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver, host, port, username, password }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new NetbackupMicroserviceError(
      `No se pudo contactar al servicio de extracción (${driver}) — revisá que netbackup-agent esté corriendo: ${err.message}`
    );
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new NetbackupMicroserviceError(body?.error || `El servicio de extracción respondió con error (HTTP ${response.status})`);
  }
  if (!body?.config) {
    throw new NetbackupMicroserviceError('El servicio de extracción no devolvió una configuración');
  }

  return body.config;
}
