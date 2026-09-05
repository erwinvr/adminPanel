/**
 * Migración de DATOS (no de esquema): recalcula `config_hash` de todas
 * las corridas exitosas ya guardadas usando el texto NORMALIZADO (ver
 * backend/src/integrations/networkBackup/configNormalizer.js) — antes
 * de esto, el hash se calculaba sobre el texto crudo, así que cada
 * backup contaba como "una config nueva" solo por la línea de
 * timestamp/contador de guardado que cada fabricante mete sola (ver el
 * comentario de configNormalizer.js para el detalle por driver). Sin
 * este backfill, Bitácora seguiría mostrando de más "configuraciones
 * únicas" para las corridas ya existentes hasta que se acumulen
 * backups nuevos.
 */

import crypto from 'node:crypto';
import { normalizeForHash } from '../../backend/src/integrations/networkBackup/configNormalizer.js';

function hashConfig(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  const runs = await knex('netbackup_runs as r')
    .join('netbackup_devices as d', 'd.id', 'r.device_id')
    .where('r.result', 'success')
    .select('r.id', 'r.config_output as configOutput', 'd.driver');

  for (const run of runs) {
    await knex('netbackup_runs')
      .where({ id: run.id })
      .update({ config_hash: hashConfig(normalizeForHash(run.driver, run.configOutput)) });
  }
}

/** @param { import("knex").Knex } knex */
export async function down() {
  // No hay forma de "deshacer" un recálculo de hash sin guardar el valor
  // anterior — y el hash viejo (sobre texto crudo) era justamente el
  // comportamiento incorrecto que esta migración corrige, así que no
  // tiene sentido revertirlo. down() queda intencionalmente vacío.
}
