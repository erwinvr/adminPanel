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
const BATCH_CONCURRENCY = 6;
const MAX_RETRIES = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(headers, attempt) {
  const seconds = Number(headers?.['Retry-After'] ?? headers?.['retry-after']);
  return Math.min((Number.isFinite(seconds) && seconds > 0 ? seconds : 2 ** attempt) * 1000, 30000);
}

/** Un $batch de hasta 20 usuarios → `{ id → { status, body, headers } }`, reintentando si el lote entero es throttled. */
async function postAuthMethodsBatch(accessToken, userIds) {
  const requests = userIds.map((userId, i) => ({ id: String(i), method: 'GET', url: `/users/${userId}/authentication/methods` }));

  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${GRAPH_BASE_URL}/$batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });
    if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
      await sleep(retryAfterMs({ 'Retry-After': response.headers.get('retry-after') }, attempt));
      continue;
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new GraphApiError('Microsoft Graph respondió con un error: ' + (payload?.error?.message ?? `HTTP ${response.status}`));
    }
    const byRequestId = new Map((payload.responses ?? []).map((r) => [r.id, r]));
    return userIds.map((userId, i) => ({ userId, ...(byRequestId.get(String(i)) ?? { status: 0 }) }));
  }
}

/**
 * Estado de MFA por usuario SIN licencia adicional: lee los métodos de
 * autenticación registrados de cada usuario (`/users/{id}/authentication/methods`,
 * permiso de aplicación `UserAuthenticationMethod.Read.All`) en lotes de
 * 20 vía `$batch`, con reintento ante throttling (429).
 *
 * Solo informa REGISTRO de métodos (tiene o no un método de segundo
 * factor), no si el tenant lo EXIGE (Acceso condicional / security
 * defaults) ni la capacidad por política — eso solo lo da el reporte
 * premium. Por eso `isMfaCapable` no se completa acá.
 *
 * @param {string} accessToken
 * @param {string[]} userIds
 * @returns {Promise<{ byUserId: Map<string, { isMfaRegistered: boolean, methodsRegistered: string[] }>, failedCount: number, sampleError: string | null }>}
 */
export async function fetchUsersAuthMethods(accessToken, userIds) {
  const byUserId = new Map();
  let failedCount = 0;
  let sampleError = null;

  const batches = [];
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) batches.push(userIds.slice(i, i + BATCH_SIZE));

  const record = (result) => {
    if (result.status === 200) {
      const types = (result.body?.value ?? []).map((m) => String(m['@odata.type'] ?? '').replace('#microsoft.graph.', ''));
      const known = types.map((t) => AUTH_METHOD_TYPES[t]).filter(Boolean);
      byUserId.set(result.userId, {
        isMfaRegistered: known.some((m) => m.mfa),
        methodsRegistered: known.map((m) => m.label),
      });
      return null;
    }
    return result;
  };

  // Un usuario cuyo sub-request fue throttled (429) se reintenta aparte.
  async function runBatch(batch) {
    let pending = batch;
    for (let attempt = 1; pending.length; attempt += 1) {
      const results = await postAuthMethodsBatch(accessToken, pending);
      const notOk = results.map(record).filter(Boolean);
      const throttled = notOk.filter((r) => r.status === 429);
      const failed = notOk.filter((r) => r.status !== 429);
      for (const f of failed) {
        failedCount += 1;
        sampleError ??= f.body?.error?.message ?? `HTTP ${f.status}`;
      }
      if (!throttled.length) return notOk;
      if (attempt >= MAX_RETRIES) {
        for (const t of throttled) {
          failedCount += 1;
          sampleError ??= 'Microsoft Graph limitó la tasa de consultas (429) y se agotaron los reintentos';
        }
        return notOk;
      }
      await sleep(Math.max(...throttled.map((t) => retryAfterMs(t.headers, attempt))));
      pending = throttled.map((t) => t.userId);
    }
    return [];
  }

  if (!batches.length) return { byUserId, failedCount, sampleError };

  // El primer lote va SOLO: si todo da 403 es que falta el permiso de
  // aplicación — se corta enseguida en vez de repetir el error 3.500 veces.
  const firstFailures = await runBatch(batches[0]);
  if (firstFailures.length === batches[0].length && firstFailures.every((r) => r.status === 403)) {
    throw new GraphApiError(
      'Microsoft Graph rechazó la lectura de métodos de autenticación (403) — falta el permiso de aplicación "UserAuthenticationMethod.Read.All" con consentimiento de administrador en la app de Azure AD.'
    );
  }

  let next = 1;
  const workers = Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length - 1) }, async () => {
    while (next < batches.length) {
      const batch = batches[next];
      next += 1;
      await runBatch(batch);
    }
  });
  await Promise.all(workers);

  return { byUserId, failedCount, sampleError };
}
