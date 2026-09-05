import { db } from '../config/database.js';

export const smtpRepository = {
  getSettings() {
    return db('smtp_settings').first();
  },

  async upsertSettings(changes) {
    const existing = await db('smtp_settings').first();
    if (existing) {
      const [row] = await db('smtp_settings').where({ id: existing.id }).update(changes).returning('*');
      return row;
    }
    const [row] = await db('smtp_settings').insert(changes).returning('*');
    return row;
  },
};
