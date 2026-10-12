import { db } from '../config/database.js';

/**
 * Repositorio de una tabla de configuración de UNA sola fila (ad_settings,
 * m365_settings, backup_settings, pam360_settings, vuln_settings,
 * smtp_settings): leer la fila y "crear o actualizar" la única que hay.
 *
 * @param {string} table
 */
export function createSettingsRepository(table) {
  return {
    getSettings() {
      return db(table).first();
    },

    // "Check-then-act" (lee, después inserta o actualiza) — sin el lock de
    // abajo, dos guardados casi simultáneos la primera vez que se configura
    // una integración (doble clic, reintento del frontend) pueden ver los
    // dos `existing = undefined` y terminar insertando dos filas en una
    // tabla pensada para tener una sola. `pg_advisory_xact_lock` serializa
    // los upserts de ESTA tabla (se libera solo al cerrar la transacción);
    // no hace falta una migración ni una columna UNIQUE nueva.
    async upsertSettings(changes) {
      return db.transaction(async (trx) => {
        await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [table]);
        const existing = await trx(table).first();
        if (existing) {
          const [row] = await trx(table).where({ id: existing.id }).update(changes).returning('*');
          return row;
        }
        const [row] = await trx(table).insert(changes).returning('*');
        return row;
      });
    },
  };
}
