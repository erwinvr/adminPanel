/**
 * topology/csvImport.js
 *
 * Parser de CSV mínimo para la importación de cajas del mapa de topología
 * (ver topology.service.js#importNodes) — sin dependencia nueva, mismo
 * criterio que reports/csvWriter.js (que arma el CSV en sentido contrario).
 * Soporta campos entre comillas (con comas/comillas escapadas `""` y
 * saltos de línea adentro) y detecta solo si el separador es coma o punto
 * y coma (la plantilla que se descarga usa coma; si alguien la abre y
 * resguarda con Excel en una configuración regional que usa coma decimal,
 * suele guardar con punto y coma).
 */

function detectDelimiter(firstLine) {
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
}

/** @returns {string[][]} una fila por línea (la primera es el encabezado), cada una como array de celdas. */
export function parseCsv(text) {
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiter = detectDelimiter(clean.slice(0, clean.indexOf('\n') > -1 ? clean.indexOf('\n') : clean.length));

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      pushField();
    } else if (c === '\n') {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length || row.length) pushRow();

  // Descarta líneas totalmente vacías (ej. una línea en blanco al final del archivo).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}
