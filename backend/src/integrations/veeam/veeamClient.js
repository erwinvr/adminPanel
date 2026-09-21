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

import https from 'node:https';
import { AppError } from '../../errors/AppError.js';

const API_VERSION_HEADER = '1.2-rev0';

export class VeeamApiError extends AppError {
  constructor(message) {
    super(message, 502, 'BACKUP_SYNC_FAILED');
  }
}

// Mensajes accionables para las fallas de red/TLS más comunes — el
// `fetch failed` genérico de Node esconde el motivo real en `err.cause`.
function describeNetworkError(err) {
  const code = err.code;
  if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return 'el servidor de Veeam usa un certificado autofirmado o no confiable — desmarcá "Verificar certificado TLS" en la configuración si es el caso esperado.';
  }
  if (code === 'ECONNREFUSED') return 'conexión rechazada (¿el servicio REST de Veeam está activo en ese puerto?).';
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'sin respuesta del servidor (revisá red y firewall).';
  if (code === 'ENOTFOUND') return 'no se pudo resolver el nombre del servidor.';
  return err.message;
}

/**
 * Request HTTPS con control explícito de la verificación del certificado
 * (el `fetch` global de Node no lo permite por request sin `undici`).
 * Devuelve `{ status, ok, json }`.
 */
function httpsRequest(url, { method = 'GET', headers = {}, body, verifyTls }) {
  return new Promise((resolve, reject) => {
    // Content-Length explícito: sin él Node manda el body con
    // `Transfer-Encoding: chunked` y el servidor REST de Veeam nunca responde.
    const finalHeaders = body ? { ...headers, 'Content-Length': Buffer.byteLength(body) } : headers;
    const req = https.request(
      url,
      { method, headers: finalHeaders, rejectUnauthorized: verifyTls, timeout: 15000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            /* respuesta no JSON */
          }
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, json });
        });
      }
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function headers(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'x-api-version': API_VERSION_HEADER,
    Accept: 'application/json',
  };
}

/**
 * @param {{ baseUrl: string, username: string, password: string, verifyTls?: boolean }} params
 * @returns {Promise<string>} access token
 */
export async function getAccessToken({ baseUrl, username, password, verifyTls = true }) {
  const tokenUrl = `${baseUrl.replace(/\/$/, '')}/api/oauth2/token`;
  const body = new URLSearchParams({ grant_type: 'password', username, password });

  let response;
  try {
    response = await httpsRequest(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-api-version': API_VERSION_HEADER },
      body: body.toString(),
      verifyTls,
    });
  } catch (err) {
    throw new VeeamApiError('No se pudo contactar al servidor de Veeam: ' + describeNetworkError(err));
  }

  const payload = response.json;
  if (!response.ok) {
    const detail = payload?.error_description ?? payload?.message ?? `HTTP ${response.status}`;
    throw new VeeamApiError('No se pudo autenticar contra Veeam — revisá usuario y contraseña. ' + detail);
  }
  return payload.access_token;
}

async function veeamGet(accessToken, baseUrl, path, verifyTls) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  let response;
  try {
    response = await httpsRequest(url, { headers: headers(accessToken), verifyTls });
  } catch (err) {
    throw new VeeamApiError('No se pudo contactar al servidor de Veeam: ' + describeNetworkError(err));
  }
  const payload = response.json;
  if (!response.ok) {
    const detail = payload?.message ?? `HTTP ${response.status}`;
    throw new VeeamApiError('Veeam respondió con un error: ' + detail);
  }
  return payload;
}

/** Jobs de backup con el resultado de su última ejecución. */
export async function fetchJobStates(accessToken, baseUrl, verifyTls = true) {
  const payload = await veeamGet(accessToken, baseUrl, '/api/v1/jobs/states', verifyTls);
  return payload?.data ?? [];
}

/** Repositorios de backup con capacidad total y espacio libre. */
export async function fetchRepositoryStates(accessToken, baseUrl, verifyTls = true) {
  const payload = await veeamGet(accessToken, baseUrl, '/api/v1/backupInfrastructure/repositories/states', verifyTls);
  return payload?.data ?? [];
}
