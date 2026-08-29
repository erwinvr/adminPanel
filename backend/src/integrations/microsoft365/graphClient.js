/**
 * integrations/microsoft365/graphClient.js
 *
 * Cliente mínimo de Microsoft Graph, autenticado vía OAuth2 client
 * credentials (app-only, sin usuario interactivo) — el flujo correcto
 * para un servicio de sincronización en background. Requiere que la
 * app registrada en Azure AD tenga los permisos de aplicación
 * `Organization.Read.All` y `User.Read.All` (Microsoft Graph) con
 * consentimiento de administrador otorgado.
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
 * Estado de MFA por usuario (isMfaRegistered / isMfaCapable / métodos
 * registrados). Requiere el permiso de aplicación AuditLog.Read.All
 * ADEMÁS de Organization.Read.All + User.Read.All — si el tenant no lo
 * otorgó, Graph devuelve 403 y quien llama a esta función debe
 * capturarlo sin abortar el resto de la sincronización (ver
 * services/m365.service.js).
 */
export function fetchUserRegistrationDetails(accessToken) {
  return graphGetAll(accessToken, '/reports/authenticationMethods/userRegistrationDetails?$top=999');
}
