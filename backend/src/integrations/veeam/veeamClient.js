/**
 * integrations/veeam/veeamClient.js
 *
 * Cliente mínimo de la REST API de Veeam Backup & Replication (v13),
 * expuesta por el propio servidor de Veeam en el puerto 9419. Se
 * autentica con `grant_type=password` (usuario/contraseña de una
 * cuenta con rol de solo lectura alcanza) contra `/api/oauth2/token`,
 * y usa el `access_token` devuelto como Bearer en cada request
 * siguiente — sin dependencias nuevas, `fetch` global de Node.
 *
 * Los endpoints de jobs/repositorios reflejan la forma documentada de
 * la REST API v1 de VBR al momento de escribir esto — si la versión
 * real del servidor difiere en algún campo, ajustar acá nomás
 * (services/backup.service.js consume la forma ya normalizada que
 * devuelven estas funciones, no toca el payload crudo de Veeam).
 */

import { AppError } from '../../errors/AppError.js';

const API_VERSION_HEADER = '1.2-rev0';

export class VeeamApiError extends AppError {
  constructor(message) {
    super(message, 502, 'BACKUP_SYNC_FAILED');
  }
}

function headers(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'x-api-version': API_VERSION_HEADER,
    Accept: 'application/json',
  };
}

/**
 * @param {{ baseUrl: string, username: string, password: string }} params
 * @returns {Promise<string>} access token
 */
export async function getAccessToken({ baseUrl, username, password }) {
  const tokenUrl = `${baseUrl.replace(/\/$/, '')}/api/oauth2/token`;
  const body = new URLSearchParams({ grant_type: 'password', username, password });

  let response;
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-api-version': API_VERSION_HEADER },
      body,
    });
  } catch (err) {
    throw new VeeamApiError('No se pudo contactar al servidor de Veeam (revisá la URL y la conectividad de red): ' + err.message);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.error_description ?? payload?.message ?? `HTTP ${response.status}`;
    throw new VeeamApiError('No se pudo autenticar contra Veeam — revisá usuario y contraseña. ' + detail);
  }
  return payload.access_token;
}

async function veeamGet(accessToken, baseUrl, path) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, { headers: headers(accessToken) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.message ?? `HTTP ${response.status}`;
    throw new VeeamApiError('Veeam respondió con un error: ' + detail);
  }
  return payload;
}

/** Jobs de backup con el resultado de su última ejecución. */
export async function fetchJobStates(accessToken, baseUrl) {
  const payload = await veeamGet(accessToken, baseUrl, '/api/v1/jobs/states');
  return payload?.data ?? [];
}

/** Repositorios de backup con capacidad total y espacio libre. */
export async function fetchRepositoryStates(accessToken, baseUrl) {
  const payload = await veeamGet(accessToken, baseUrl, '/api/v1/backupInfrastructure/repositories/states');
  return payload?.data ?? [];
}
