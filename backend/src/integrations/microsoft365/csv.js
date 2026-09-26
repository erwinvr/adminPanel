/**
 * integrations/microsoft365/csv.js
 *
 * Lector de CSV mínimo (RFC 4180: campos entre comillas, comillas
 * duplicadas y saltos de línea dentro de un campo). Los informes de uso de
 * Microsoft Graph (`/reports/...`) se devuelven como CSV, no como JSON.
 */

/** @param {string} text @returns {string[][]} */
function parseRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row); // ignora líneas vacías
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

/**
 * CSV con encabezado → array de objetos `{ [columna]: valor }` (todo texto).
 *
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
export function parseCsv(text) {
  const [header, ...rows] = parseRows(text.replace(/^﻿/, ''));
  if (!header) return [];
  return rows.map((cells) => Object.fromEntries(header.map((name, i) => [name.trim(), cells[i] ?? ''])));
}
