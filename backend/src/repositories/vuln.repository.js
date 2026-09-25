import { db } from '../config/database.js';
import { createSettingsRepository } from './settings.js';
import { replaceTableContents } from './bulk.js';

export const vulnRepository = {
  ...createSettingsRepository('vuln_settings'),

  replaceSyncedComputers(computers) {
    return replaceTableContents(db, 'vuln_computers', computers);
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
