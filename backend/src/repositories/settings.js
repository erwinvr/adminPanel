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

    async upsertSettings(changes) {
      const existing = await db(table).first();
      if (existing) {
        const [row] = await db(table).where({ id: existing.id }).update(changes).returning('*');
        return row;
      }
      const [row] = await db(table).insert(changes).returning('*');
      return row;
    },
  };
}
