import { db } from '../config/database.js';
import { createSettingsRepository } from './settings.js';
import { replaceTableContents } from './bulk.js';

export const backupRepository = {
  ...createSettingsRepository('backup_settings'),

  replaceSyncedJobs(jobs) {
    return replaceTableContents(db, 'backup_jobs', jobs);
  },

  replaceSyncedRepositories(repositories) {
    return replaceTableContents(db, 'backup_repositories', repositories);
  },

  listJobs() {
    return db('backup_jobs')
      .select('id', 'veeam_job_id as veeamJobId', 'name', 'last_status as lastStatus', 'last_run_at as lastRunAt', 'synced_at as syncedAt')
      .orderBy('name');
  },

  listRepositories() {
    return db('backup_repositories')
      .select(
        'id',
        'veeam_repository_id as veeamRepositoryId',
        'name',
        'capacity_bytes as capacityBytes',
        'free_bytes as freeBytes',
        'synced_at as syncedAt'
      )
      .orderBy('name');
  },
};
