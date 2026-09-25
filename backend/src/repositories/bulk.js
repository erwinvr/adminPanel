/**
 * repositories/bulk.js
 *
 * PostgreSQL acepta como máximo 65.535 parámetros por consulta: un
 * `insert(rows)` de N filas × C columnas falla si N·C lo supera (ej. AD
 * con 11 columnas rompe a partir de ~5.900 usuarios). Los syncs traen
 * miles de filas, así que se insertan siempre por lotes.
 */

// Margen bajo el límite de 65.535 del protocolo.
const MAX_BIND_PARAMETERS = 60000;

/**
 * Inserta `rows` en lotes que respetan el límite de parámetros.
 *
 * @param {import('knex').Knex | import('knex').Knex.Transaction} knex
 * @param {string} table
 * @param {object[]} rows
 * @param {{ returning?: string[], onConflict?: string }} [options]
 *   `onConflict`: columna única para hacer upsert (`ON CONFLICT ... MERGE`).
 * @returns {Promise<object[]>} filas devueltas (si se pidió `returning`)
 */
export async function chunkedInsert(knex, table, rows, { returning, onConflict } = {}) {
  if (!rows.length) return [];

  const columns = new Set();
  for (const row of rows) for (const key of Object.keys(row)) columns.add(key);
  const batchSize = Math.max(1, Math.floor(MAX_BIND_PARAMETERS / columns.size));

  const returned = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    let query = knex(table).insert(rows.slice(i, i + batchSize));
    if (onConflict) query = query.onConflict(onConflict).merge();
    if (returning) query = query.returning(returning);
    const result = await query;
    if (returning) returned.push(...result);
  }
  return returned;
}

/**
 * Reemplaza TODO el contenido de `table` por `rows` en una transacción
 * (foto del último sync, no un espejo incremental).
 */
export function replaceTableContents(knex, table, rows) {
  return knex.transaction(async (trx) => {
    await trx(table).del();
    await chunkedInsert(trx, table, rows);
  });
}
