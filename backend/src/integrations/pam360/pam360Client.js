/**
 * integrations/pam360/pam360Client.js
 *
 * Cliente mínimo de la REST API de ManageEngine PAM360. A diferencia
 * de Veeam/Microsoft 365 (Bearer/OAuth2), PAM360 se autentica con un
 * API key generado a mano en la consola (Admin → API User Accounts)
 * que va en el header `AUTHTOKEN` de cada request — mismo estilo que
 * `integrations/endpointCentral/endpointCentralClient.js` (otro
 * producto ManageEngine), pero ese usa `Authorization` y PAM360 usa
 * `AUTHTOKEN` como nombre de header propio.
 *
 * Se usa `node:https` directo (no el `fetch` global) para poder
 * controlar `rejectUnauthorized` por request — mismo motivo que
 * `veeamClient.js`, que además descubrió que Node necesita esto para
 * servidores con certificado autofirmado.
 *
 * El único endpoint documentado públicamente que sirve para el reporte
 * de solicitudes de acceso es "Fetch the List of Password Requests"
 * (GET /restapi/json/v1/accounts/passwordaccessrequests) — devuelve,
 * documentado tal cual, `operation.Details[]` (uno por
 * SOLICITANTE) con `PASSWORDREQUESTLIST[]` anidado (una por solicitud
 * puntual). No hay instancia real de PAM360 disponible en este
 * entorno para confirmar que el shape real coincide con la
 * documentación — ver docs/pam360.md, sección de verificación
 * pendiente.
 */

import { AppError } from '../../errors/AppError.js';
import { httpsRequest, describeNetworkError } from '../http/httpsRequest.js';

export class Pam360ApiError extends AppError {
  constructor(message) {
    super(message, 502, 'PAM360_SYNC_FAILED');
  }
}

async function pam360Get(baseUrl, path, { authToken, verifyTls }) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  let response;
  try {
    response = await httpsRequest(url, { headers: { AUTHTOKEN: authToken, Accept: 'application/json' }, verifyTls });
  } catch (err) {
    throw new Pam360ApiError('No se pudo contactar al servidor de PAM360: ' + describeNetworkError(err, 'PAM360'));
  }

  const result = response.json?.operation?.result;
  // PAM360 devuelve 200 con el estado real adentro de `operation.result`
  // en algunos casos (ver docs) — se valida tanto el código HTTP como
  // `result.status` para no tratar un error de negocio como éxito.
  if (!response.ok || (result && result.status && result.status !== 'Success')) {
    const detail = result?.message ?? `HTTP ${response.status}`;
    const code = result?.statusCode ? ` [${result.statusCode}]` : '';
    throw new Pam360ApiError(`PAM360 respondió con un error: ${detail}${code}`);
  }
  return response.json;
}

/**
 * Valida el AUTHTOKEN llamando al mismo endpoint que usa el sync — no
 * hay un endpoint "ping" documentado públicamente, así que se reusa el
 * real en vez de inventar uno.
 *
 * @param {{ baseUrl: string, authToken: string, verifyTls?: boolean }} params
 */
export async function verifyAuthToken({ baseUrl, authToken, verifyTls = true }) {
  await pam360Get(baseUrl, '/restapi/json/v1/accounts/passwordaccessrequests', { authToken, verifyTls });
}

// Desfase (ms) de `timeZone` respecto de UTC en el instante dado.
function zoneOffsetMs(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * "Dec 30, 2025 04:45 PM" (hora LOCAL del servidor de PAM360, sin zona)
 * → Date en UTC real, usando la zona IANA configurada. null si no parsea.
 */
function parsePam360DateTime(value, timeZone) {
  if (!value) return null;
  const wallClockAsUtc = new Date(`${value} UTC`);
  if (Number.isNaN(wallClockAsUtc.getTime())) return null;
  // Dos pasadas: la segunda corrige el desfase cerca de un cambio de horario (DST).
  const firstGuess = wallClockAsUtc.getTime() - zoneOffsetMs(wallClockAsUtc, timeZone);
  return new Date(wallClockAsUtc.getTime() - zoneOffsetMs(new Date(firstGuess), timeZone));
}

/**
 * Solicitudes de acceso a contraseñas — aplana
 * `operation.Details[]` (uno por solicitante) +
 * `PASSWORDREQUESTLIST[]` anidado (una entrada por solicitud puntual)
 * a una lista plana normalizada.
 *
 * @param {{ baseUrl: string, authToken: string, verifyTls?: boolean, timeZone?: string }} params
 */
export async function fetchAccessRequests({ baseUrl, authToken, verifyTls = true, timeZone = 'UTC' }) {
  const payload = await pam360Get(baseUrl, '/restapi/json/v1/accounts/passwordaccessrequests', { authToken, verifyTls });
  const details = payload?.operation?.Details ?? [];

  const requests = [];
  for (const requester of details) {
    const list = requester?.PASSWORDREQUESTLIST ?? [];
    for (const item of list) {
      requests.push({
        pam360RequestId: String(item['PASSWD ID'] ?? ''),
        requesterUsername: requester['REQUESTED BY'] ?? null,
        requesterFullname: requester['REQUESTED BY FULLNAME'] ?? null,
        resourceName: item['RESOURCE NAME'] ?? null,
        accountName: item['ACCOUNT NAME'] ?? null,
        reason: item['REASON'] ?? null,
        status: item['STATUS'] ?? null,
        requestedAt: parsePam360DateTime(item['REQUESTED TIME'], timeZone),
        startTime: parsePam360DateTime(item['START_TIME'], timeZone),
        endTime: parsePam360DateTime(item['END_TIME'], timeZone),
      });
    }
  }
  const usable = requests.filter((r) => r.pam360RequestId); // sin ID no hay con qué hacer upsert

  // Esta integración se escribió contra la documentación pública, sin un
  // PAM360 real para confirmar el formato. Si el servidor dice que hay
  // solicitudes pero ninguna se pudo interpretar, es mejor fallar con un
  // mensaje claro que reportar una sincronización "exitosa" con 0 filas.
  const totalRows = Number(payload?.operation?.totalRows ?? 0);
  if (totalRows > 0 && usable.length === 0) {
    throw new Pam360ApiError(
      `PAM360 informó ${totalRows} solicitud(es) pero no se pudo interpretar el formato de la respuesta (se esperaba operation.Details[].PASSWORDREQUESTLIST[] con "PASSWD ID"). Revisá docs/pam360.md.`
    );
  }
  return usable;
}
