/**
 * integrations/microsoft365/graphClient.js
 *
 * Cliente mínimo de Microsoft Graph, autenticado vía OAuth2 client
 * credentials (app-only, sin usuario interactivo) — el flujo correcto
 * para un servicio de sincronización en background. Requiere que la
 * app registrada en Azure AD tenga los permisos de aplicación
 * `Organization.Read.All` y `User.Read.All` (Microsoft Graph) con
 * consentimiento de administrador otorgado. Para el estado de MFA se
 * necesita, según el tenant, `AuditLog.Read.All` (reporte de registro,
 * solo con Entra ID P1/P2) o `UserAuthenticationMethod.Read.All`
 * (métodos por usuario, SIN licencia adicional) — ver
 * fetchUserRegistrationDetails / fetchUsersAuthMethods.
 *
 * Usa `fetch` global de Node (>=18) — sin dependencias nuevas.
 */

import { AppError } from '../../errors/AppError.js';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

export class GraphApiError extends AppError {
  constructor(message) {
    super(message, 502, 'M365_SYNC_FAILED');
  }
}

/**
 * @param {{ tenantId: string, clientId: string, clientSecret: string }} params
 * @returns {Promise<string>} access token
 */
export async function getAccessToken({ tenantId, clientId, clientSecret }) {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: GRAPH_SCOPE,
  });

  let response;
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (err) {
    throw new GraphApiError('No se pudo contactar a Microsoft (verificá la conectividad de red del servidor): ' + err.message);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.error_description?.split('\r\n')[0] ?? payload?.error ?? `HTTP ${response.status}`;
    throw new GraphApiError('No se pudo autenticar contra Microsoft 365 — revisá tenant, client ID y client secret. ' + detail);
  }
  return payload.access_token;
}

async function graphGetAll(accessToken, path) {
  const results = [];
  let url = `${GRAPH_BASE_URL}${path}`;

  while (url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.error?.message ?? `HTTP ${response.status}`;
      throw new GraphApiError('Microsoft Graph respondió con un error: ' + detail);
    }
    results.push(...(payload.value ?? []));
    url = payload['@odata.nextLink'] ?? null;
  }

  return results;
}

/** Licencias compradas por el tenant (SKUs con unidades habilitadas/consumidas). */
export function fetchSubscribedSkus(accessToken) {
  return graphGetAll(accessToken, '/subscribedSkus');
}

/** Usuarios del tenant con sus licencias asignadas (assignedLicenses trae solo skuId). */
export function fetchUsersWithLicenses(accessToken) {
  return graphGetAll(
    accessToken,
    '/users?$select=id,displayName,userPrincipalName,accountEnabled,assignedLicenses&$top=999'
  );
}

/**
 * Estado de MFA por usuario vía el REPORTE de registro (isMfaRegistered /
 * isMfaCapable / métodos). Requiere AuditLog.Read.All Y un tenant con
 * Entra ID P1/P2 — en un tenant sin esa licencia Graph responde
 * "Tenant is not a B2C tenant and doesn't have premium license". Quien
 * llama debe capturar el error y caer en fetchUsersAuthMethods (ver
 * services/m365.service.js).
 */
export function fetchUserRegistrationDetails(accessToken) {
  return graphGetAll(accessToken, '/reports/authenticationMethods/userRegistrationDetails?$top=999');
}

// Métodos de `authentication/methods` (@odata.type) → nombre mostrado
// (mismos nombres que usa el reporte premium donde hay equivalente).
// `mfa: true` = método de segundo factor real; email/TAP/password se
// listan pero NO cuentan como "MFA registrado" (email es solo para
// recuperar contraseña, TAP es temporal, password es el primer factor).
const AUTH_METHOD_TYPES = {
  microsoftAuthenticatorAuthenticationMethod: { label: 'microsoftAuthenticator', mfa: true },
  phoneAuthenticationMethod: { label: 'mobilePhone', mfa: true },
  softwareOathAuthenticationMethod: { label: 'softwareOneTimePasscode', mfa: true },
  hardwareOathAuthenticationMethod: { label: 'hardwareOneTimePasscode', mfa: true },
  fido2AuthenticationMethod: { label: 'fido2', mfa: true },
  windowsHelloForBusinessAuthenticationMethod: { label: 'windowsHelloForBusiness', mfa: true },
  platformCredentialAuthenticationMethod: { label: 'platformCredential', mfa: true },
  emailAuthenticationMethod: { label: 'email', mfa: false },
  temporaryAccessPassAuthenticationMethod: { label: 'temporaryAccessPass', mfa: false },
};

const BATCH_SIZE = 20; // máximo de sub-requests por $batch en Graph
const MAX_CONCURRENCY = 6;
const START_CONCURRENCY = 3;
const MAX_ROUNDS = 200; // tope de seguridad de pasadas de reintento; el límite real es `deadlineAt`
const MAX_PAUSE_MS = 60000;
const TRANSIENT_BATCH_STATUSES = new Set([429, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(headers, fallbackMs = 2000) {
  const seconds = Number(headers?.['Retry-After'] ?? headers?.['retry-after']);
  return Math.min((Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs), MAX_PAUSE_MS);
}

/** Falla transitoria de TODO el $batch (429/5xx): se reintenta el lote más tarde, no es un error definitivo. */
class BatchThrottledError extends Error {
  constructor(retryAfter) {
    super('batch throttled');
    this.retryAfter = retryAfter;
  }
}

/** Un $batch de hasta 20 usuarios → `[{ userId, status, body, headers }]`. */
async function postAuthMethodsBatch(accessToken, userIds) {
  const requests = userIds.map((userId, i) => ({ id: String(i), method: 'GET', url: `/users/${userId}/authentication/methods` }));

  const response = await fetch(`${GRAPH_BASE_URL}/$batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (TRANSIENT_BATCH_STATUSES.has(response.status)) {
    throw new BatchThrottledError(retryAfterMs({ 'Retry-After': response.headers.get('retry-after') }, 5000));
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GraphApiError('Microsoft Graph respondió con un error: ' + (payload?.error?.message ?? `HTTP ${response.status}`));
  }
  const byRequestId = new Map((payload.responses ?? []).map((r) => [r.id, r]));
  return userIds.map((userId, i) => ({ userId, ...(byRequestId.get(String(i)) ?? { status: 0 }) }));
}

/**
 * Estado de MFA por usuario SIN licencia adicional: lee los métodos de
 * autenticación registrados de cada usuario (`/users/{id}/authentication/methods`,
 * permiso de aplicación `UserAuthenticationMethod.Read.All`) en lotes de
 * 20 vía `$batch`.
 *
 * Con miles de usuarios Microsoft limita la tasa (429): en vez de insistir
 * (lo que solo empeora el bloqueo) se respeta su `Retry-After` con una
 * PAUSA GLOBAL para todos los lotes en vuelo, se BAJA la concurrencia ante
 * cada limitación y se SUBE de a poco mientras no haya más. Los usuarios
 * limitados se reintentan en rondas posteriores.
 *
 * Solo informa REGISTRO de métodos (tiene o no un método de segundo
 * factor), no si el tenant lo EXIGE (Acceso condicional / security
 * defaults) ni la capacidad por política — eso solo lo da el reporte
 * premium. Por eso `isMfaCapable` no se completa acá.
 *
 * @param {string} accessToken
 * @param {string[]} userIds
 * `deadlineAt` (epoch ms) acota el tiempo total: pasada esa hora no se
 * lanzan más lotes y los usuarios que no llegaron a consultarse (o quedaron
 * limitados) se devuelven en `skippedCount` para la próxima sincronización.
 *
 * @param {{ onProgress?: (done: number, total: number) => void, deadlineAt?: number }} [options]
 * @returns {Promise<{ byUserId: Map<string, { isMfaRegistered: boolean, methodsRegistered: string[] }>, failedCount: number, skippedCount: number, sampleError: string | null }>}
 */
export async function fetchUsersAuthMethods(accessToken, userIds, { onProgress, deadlineAt } = {}) {
  const byUserId = new Map();
  let failedCount = 0;
  let sampleError = null;
  let resolved = 0; // usuarios ya definitivos (con dato o con falla no reintentable)
  const total = userIds.length;

  let concurrency = START_CONCURRENCY;
  let pauseUntil = 0;
  let calmBatches = 0;

  const markResolved = (n = 1) => {
    resolved += n;
    onProgress?.(resolved, total);
  };

  const throttle = (retryAfter) => {
    pauseUntil = Math.max(pauseUntil, Date.now() + retryAfter);
    concurrency = Math.max(1, concurrency - 1);
    calmBatches = 0;
  };

  // Procesa un lote; devuelve los usuarios que hay que reintentar (limitados por 429).
  async function runBatch(batch) {
    let results;
    try {
      results = await postAuthMethodsBatch(accessToken, batch);
    } catch (err) {
      if (err instanceof BatchThrottledError) {
        throttle(err.retryAfter);
        return { retry: batch, failed: [] };
      }
      throw err;
    }

    const retry = [];
    const failed = [];
    let retryAfter = 0;
    for (const r of results) {
      if (r.status === 200) {
        const types = (r.body?.value ?? []).map((m) => String(m['@odata.type'] ?? '').replace('#microsoft.graph.', ''));
        const known = types.map((t) => AUTH_METHOD_TYPES[t]).filter(Boolean);
        byUserId.set(r.userId, { isMfaRegistered: known.some((m) => m.mfa), methodsRegistered: known.map((m) => m.label) });
        markResolved();
      } else if (r.status === 429) {
        retry.push(r.userId);
        retryAfter = Math.max(retryAfter, retryAfterMs(r.headers, 5000));
      } else {
        failed.push(r);
        failedCount += 1;
        sampleError ??= r.body?.error?.message ?? `HTTP ${r.status}`;
        markResolved();
      }
    }

    if (retry.length) throttle(retryAfter);
    else if (++calmBatches >= 5) {
      concurrency = Math.min(MAX_CONCURRENCY, concurrency + 1);
      calmBatches = 0;
    }
    return { retry, failed };
  }

  const pastDeadline = () => Boolean(deadlineAt) && Date.now() >= deadlineAt;

  // Corre una lista de lotes con concurrencia dinámica y pausa global.
  // Devuelve los usuarios a reintentar (429) y los que no llegaron por la fecha límite.
  async function runBatches(batches) {
    const toRetry = [];
    let next = 0;
    let active = 0;

    await new Promise((resolve, reject) => {
      let failedWith = null;
      const pump = async () => {
        while (!failedWith && next < batches.length && !pastDeadline()) {
          if (active >= concurrency || Date.now() < pauseUntil) {
            await sleep(Math.max(100, Math.min(pauseUntil - Date.now(), 1000)));
            continue;
          }
          const batch = batches[next];
          next += 1;
          active += 1;
          runBatch(batch)
            .then(({ retry }) => toRetry.push(...retry))
            .catch((err) => {
              failedWith ??= err;
            })
            .finally(() => {
              active -= 1;
            });
        }
        while (active > 0) await sleep(50);
        if (failedWith) reject(failedWith);
        else resolve();
      };
      pump().catch(reject);
    });
    return { retry: toRetry, skipped: batches.slice(next).flat() };
  }

  const chunk = (ids) => {
    const out = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) out.push(ids.slice(i, i + BATCH_SIZE));
    return out;
  };

  if (!total) return { byUserId, failedCount, skippedCount: 0, sampleError };
  onProgress?.(0, total);

  // El primer lote va SOLO: si todo da 403 es que falta el permiso de
  // aplicación — se corta enseguida en vez de repetir el error miles de veces.
  const [firstBatch, ...restOfFirstRound] = chunk(userIds);
  const first = await runBatch(firstBatch);
  if (first.failed.length === firstBatch.length && first.failed.every((r) => r.status === 403)) {
    throw new GraphApiError(
      'Microsoft Graph rechazó la lectura de métodos de autenticación (403) — falta el permiso de aplicación "UserAuthenticationMethod.Read.All" con consentimiento de administrador en la app de Azure AD.'
    );
  }

  const firstRound = await runBatches(restOfFirstRound);
  let pending = [...first.retry, ...firstRound.retry];
  const skipped = [...firstRound.skipped];
  for (let round = 1; pending.length && round <= MAX_ROUNDS && !pastDeadline(); round += 1) {
    await sleep(Math.max(0, Math.min(pauseUntil, deadlineAt ?? Infinity) - Date.now()));
    const result = await runBatches(chunk(pending));
    pending = result.retry;
    skipped.push(...result.skipped);
  }

  // Lo que quedó limitado o sin consultar NO es una falla: conserva su dato
  // anterior y se vuelve a intentar en la próxima sincronización.
  return { byUserId, failedCount, skippedCount: skipped.length + pending.length, sampleError };
}
