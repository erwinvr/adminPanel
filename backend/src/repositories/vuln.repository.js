import { db } from '../config/database.js';

export const vulnRepository = {
  getSettings() {
    return db('vuln_settings').first();
  },

  async upsertSettings(changes) {
    const existing = await db('vuln_settings').first();
    if (existing) {
      const [row] = await db('vuln_settings').where({ id: existing.id }).update(changes).returning('*');
      return row;
    }
    const [row] = await db('vuln_settings').insert(changes).returning('*');
    return row;
  },

  async replaceSyncedComputers(computers) {
    await db.transaction(async (trx) => {
      await trx('vuln_computers').del();
      if (computers.length) await trx('vuln_computers').insert(computers);
    });
  },

  listComputers() {
    return db('vuln_computers')
      .select('id', 'resource_id as resourceId', 'computer_name as computerName', 'pending_patches_count as pendingPatchesCount', 'synced_at as syncedAt')
      .orderBy('computer_name');
  },

  topComputersByPendingPatches(limit = 10) {
    return db('vuln_computers')
      .select('id', 'computer_name as computerName', 'pending_patches_count as pendingPatchesCount')
      .where('pending_patches_count', '>', 0)
      .orderBy('pending_patches_count', 'desc')
      .limit(limit);
  },

  countComputers() {
    return db('vuln_computers')
      .count({ count: '*' })
      .first()
      .then((r) => Number(r.count));
  },

  countComputersWithPendingPatches() {
    return db('vuln_computers')
      .where('pending_patches_count', '>', 0)
      .count({ count: '*' })
      .first()
      .then((r) => Number(r.count));
  },
};
