/**
 * reports/csvWriter.js
 *
 * Arma el CSV de un reporte. Dos formatos, porque Excel interpreta el CSV
 * según la configuración regional del sistema:
 *  - `std`: separador coma y punto decimal (Excel en inglés, Google Sheets, etc.).
 *  - `es`:  separador punto y coma y coma decimal (Excel en español).
 * Siempre UTF-8 con BOM (para que Excel respete las tildes) y CRLF.
 *
 * Los textos que empiezan con = + - @ (o tab/CR) se prefijan con una comilla
 * simple: si no, Excel los ejecuta como FÓRMULA (inyección de fórmulas) y los
 * nombres/correos vienen de sistemas externos.
 */

const BOM = '﻿';
const FORMULA_START = /^[=+\-@\t\r]/;

function formatNumber(value, decimals, decimalComma) {
  const text = value.toFixed(decimals);
  return decimalComma ? text.replace('.', ',') : text;
}

/** Valor de una celda según el tipo de la columna (ver reportCatalog.js). */
function cellValue(value, type, decimalComma) {
  if (value == null || value === '') return '';
  switch (type) {
    case 'bytes':
      return formatNumber(Number(value) / 1024 ** 3, 2, decimalComma); // el encabezado dice "(GB)"
    case 'percent':
      return formatNumber(Number(value), 1, decimalComma);
    case 'number':
      return String(Math.round(Number(value)));
    case 'bool':
      return value ? 'Sí' : 'No';
    default: {
      const text = String(value);
      return FORMULA_START.test(text) ? `'${text}` : text;
    }
  }
}

function escapeCell(text, separator) {
  return text.includes(separator) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param {{ columns: { key: string, label: string, type: string }[], rows: object[], format?: 'std' | 'es' }} params
 * @returns {string}
 */
export function toCsv({ columns, rows, format = 'std' }) {
  const separator = format === 'es' ? ';' : ',';
  const decimalComma = format === 'es';
  const header = columns.map((c) => escapeCell(c.type === 'bytes' ? `${c.label} (GB)` : c.label, separator));
  const lines = [header.join(separator)];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(cellValue(row[c.key], c.type, decimalComma), separator)).join(separator));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}
