/**
 * integrations/endpointCentral/endpointCentralClient.js
 *
 * Cliente mínimo de la REST API de ManageEngine Endpoint Central
 * (gestión de parches/vulnerabilidades). A diferencia de Microsoft
 * Graph o Veeam, acá la autenticación es un API key generado a mano
 * desde la consola de Endpoint Central (Admin → API Key Generation) —
 * no hay intercambio de credenciales por token, el API key ya ES el
 * Bearer en cada request.
 *
 * El endpoint de resumen de parches por equipo refleja la forma
 * documentada de la REST API 1.4 al momento de escribir esto — si la
 * versión real del servidor difiere en algún campo, ajustar acá nomás
 * (services/vuln.service.js consume la forma ya normalizada).
 */

import { AppError } from '../../errors/AppError.js';

export class EndpointCentralApiError extends AppError {
  constructor(message) {
    super(message, 502, 'VULN_SYNC_FAILED');
  }
}

/**
 * Endpoint Central responde HTTP 200 (¡no 401/403!) incluso cuando el API key
 * no tiene permiso para esa API puntual — el error viene en el cuerpo
 * (`{"status":"error","error_code":"1010","error_description":"..."}`, código
 * 1010 = "User is not authorized to access this API"). Revisar solo
 * `response.ok` deja pasar esto como si fuera una lista vacía: el sync
 * terminaba "exitoso" con 0 equipos en vez de avisar el motivo real.
 */
function assertNotApiError(payload, context) {
  if (payload == null) {
    throw new EndpointCentralApiError(`Endpoint Central devolvió una respuesta vacía o no-JSON en ${context} — probablemente un corte de red; reintentá.`);
  }
  if (payload?.status === 'error') {
    const code = payload.error_code ? ` (código ${payload.error_code})` : '';
    const detail = payload.error_description ?? 'motivo no informado';
    const hint =
      payload.error_code === '1010'
        ? ' — revisá en Endpoint Central (Admin → API Key Generation) que el API key tenga marcado el permiso de esta API.'
        : '';
    throw new EndpointCentralApiError(`Endpoint Central rechazó ${context}: ${detail}${code}.${hint}`);
  }
}

/**
 * No hay login propiamente dicho — se valida el API key pegándole a un
 * endpoint liviano, así el botón "Guardar configuración" puede avisar
 * de inmediato si está mal en vez de recién fallar en el próximo sync.
 *
 * @param {{ baseUrl: string, apiKey: string }} params
 */
export async function verifyApiKey({ baseUrl, apiKey }) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/1.4/patch/allsystems?page=1&pagelimit=1`;
  let response;
  try {
    response = await fetch(url, { headers: { Authorization: apiKey, Accept: 'application/json' } });
  } catch (err) {
    throw new EndpointCentralApiError('No se pudo contactar al servidor de Endpoint Central: ' + err.message);
  }
  if (!response.ok) {
    throw new EndpointCentralApiError('El API key fue rechazado — revisá que sea válido y no haya vencido. HTTP ' + response.status);
  }
  const payload = await response.json().catch(() => null);
  assertNotApiError(payload, 'la validación del API key');
}

/** Resumen de parches pendientes por equipo, paginado. */
export async function fetchComputerPatchSummary({ baseUrl, apiKey }) {
  const results = [];
  let page = 1;
  const pageLimit = 200;

  // El resumen puede llegar en varias páginas — se acumulan hasta que
  // el servidor deja de devolver una página completa.
  for (;;) {
    const url = `${baseUrl.replace(/\/$/, '')}/api/1.4/patch/allsystems?page=${page}&pagelimit=${pageLimit}`;
    let response;
    try {
      response = await fetch(url, { headers: { Authorization: apiKey, Accept: 'application/json' } });
    } catch (err) {
      throw new EndpointCentralApiError('No se pudo contactar al servidor de Endpoint Central: ' + err.message);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.message ?? `HTTP ${response.status}`;
      throw new EndpointCentralApiError('Endpoint Central respondió con un error: ' + detail);
    }
    assertNotApiError(payload, 'la lectura del resumen de parches');

    // La respuesta real anida los equipos en message_response.allsystems (sin
    // "view"): se comprobó contra el servidor — ver docs/vulnerabilidades.md.
    const rows = payload?.message_response?.allsystems ?? payload?.data ?? [];
    results.push(...rows);
    if (rows.length < pageLimit) break;
    page += 1;
    if (page > 50) break; // salvaguarda ante una API que nunca deje de paginar
  }

  return results;
}
