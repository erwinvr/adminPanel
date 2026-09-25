/**
 * integrations/http/httpsRequest.js
 *
 * Cliente HTTPS mínimo con control explícito de la verificación del
 * certificado por request (el `fetch` global de Node no lo permite sin
 * `undici`). Lo comparten las integraciones de servidores on-prem con
 * certificado autofirmado (Veeam, PAM360).
 */

import https from 'node:https';

/**
 * @param {string} url
 * @param {{ method?: string, headers?: object, body?: string, verifyTls?: boolean, timeoutMs?: number }} [options]
 * @returns {Promise<{ status: number, ok: boolean, json: any }>} `json` es null si la respuesta no es JSON
 */
export function httpsRequest(url, { method = 'GET', headers = {}, body, verifyTls = true, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    // Content-Length explícito: sin él Node manda el body con
    // `Transfer-Encoding: chunked` y el servidor REST de Veeam nunca responde.
    const finalHeaders = body ? { ...headers, 'Content-Length': Buffer.byteLength(body) } : headers;
    const req = https.request(url, { method, headers: finalHeaders, rejectUnauthorized: verifyTls, timeout: timeoutMs }, (res) => {
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
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Mensaje accionable para las fallas de red/TLS más comunes — el
 * `fetch failed`/`ECONNREFUSED` pelado de Node no dice qué revisar.
 *
 * @param {Error & { code?: string }} err
 * @param {string} product nombre del producto para el mensaje ("Veeam", "PAM360")
 */
export function describeNetworkError(err, product) {
  const code = err.code;
  if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return `el servidor de ${product} usa un certificado autofirmado o no confiable — desmarcá "Verificar certificado TLS" en la configuración si es el caso esperado.`;
  }
  if (code === 'ECONNREFUSED') return `conexión rechazada (¿el servicio REST de ${product} está activo en ese puerto?).`;
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'sin respuesta del servidor (revisá red y firewall).';
  if (code === 'ENOTFOUND') return 'no se pudo resolver el nombre del servidor.';
  return err.message;
}
