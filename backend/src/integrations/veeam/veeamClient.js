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

// Tipos de job que esta versión de la API (1.2-rev0, la que el propio
// Veeam marca como deprecated en su spec) sabe serializar. Pedir
// "todos los jobs" sin filtro hace que, si UN SOLO job en el entorno
// es de un tipo que esta versión no reconoce (Tape, Agent, SureBackup,
// CDP, Backup Copy de VM, etc. — normal en producción con muchos
// jobs, y por eso invisible en un ambiente de prueba con pocos o
// ninguno), Veeam responda 500 "Unknown job type" y se pierda TODO el
// lote, jobs conocidos incluidos. Pidiendo un tipo a la vez
// (`typeFilter`), el filtrado ocurre del lado del servidor ANTES de
// serializar la respuesta — un tipo no reconocido ni siquiera entra al
// lote de ese request, así que nunca dispara el error, y si un tipo
// puntual falla por otro motivo no se pierden los demás.
const KNOWN_JOB_TYPES = [
  'Backup',
  'VSphereReplica',
  'CloudDirectorBackup',
  'EntraIDTenantBackup',
  'EntraIDAuditLogBackup',
  'FileBackupCopy',
];

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
    // Veeam documenta sus errores como { errorCode, message, resourceId }
    // — mostrar los tres en vez de solo `message` (o peor, un genérico
    // "HTTP 500" cuando el cuerpo no vino en JSON) es lo que permite
    // identificar QUÉ recurso puntual falló, no solo que algo falló.
    const detail = payload?.message ?? `HTTP ${response.status}`;
    const code = payload?.errorCode ? ` [${payload.errorCode}]` : '';
    const resource = payload?.resourceId ? ` (resourceId: ${payload.resourceId})` : '';
    throw new VeeamApiError(`Veeam respondió con un error: ${detail}${code}${resource}`);
  }
  return payload;
}

/**
 * Jobs de backup con el resultado de su última ejecución — un request
 * POR TIPO conocido (ver KNOWN_JOB_TYPES) en vez de un único request
 * "todos los jobs", para no perder el lote entero si el entorno tiene
 * algún job de un tipo que esta versión de la API no reconoce. Si un
 * tipo puntual falla, se sigue con el resto y el detalle de esa falla
 * puntual se devuelve en `warnings` — no aborta toda la sincronización.
 */
export async function fetchJobStates(accessToken, baseUrl, verifyTls = true) {
  const jobs = [];
  const warnings = [];
  for (const type of KNOWN_JOB_TYPES) {
    try {
      const payload = await veeamGet(accessToken, baseUrl, `/api/v1/jobs/states?typeFilter=${type}`, verifyTls);
      jobs.push(...(payload?.data ?? []));
    } catch (err) {
      warnings.push(`${type}: ${err.message}`);
    }
  }
  if (warnings.length === KNOWN_JOB_TYPES.length) {
    throw new VeeamApiError('No se pudo traer el estado de ningún job: ' + warnings.join(' | '));
  }
  return { jobs, warnings };
}

/** Repositorios de backup con capacidad total y espacio libre. */
export async function fetchRepositoryStates(accessToken, baseUrl, verifyTls = true) {
  const payload = await veeamGet(accessToken, baseUrl, '/api/v1/backupInfrastructure/repositories/states', verifyTls);
  return payload?.data ?? [];
}
