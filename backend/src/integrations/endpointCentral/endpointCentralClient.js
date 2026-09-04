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

    const rows = payload?.message_response?.allsystemsview ?? payload?.data ?? [];
    results.push(...rows);
    if (rows.length < pageLimit) break;
    page += 1;
    if (page > 50) break; // salvaguarda ante una API que nunca deje de paginar
  }

  return results;
}
