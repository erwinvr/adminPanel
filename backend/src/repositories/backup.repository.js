import { db } from '../config/database.js';

export const backupRepository = {
  getSettings() {
    return db('backup_settings').first();
  },

  async upsertSettings(changes) {
    const existing = await db('backup_settings').first();
    if (existing) {
      const [row] = await db('backup_settings').where({ id: existing.id }).update(changes).returning('*');
      return row;
    }
    const [row] = await db('backup_settings').insert(changes).returning('*');
    return row;
  },

  async replaceSyncedJobs(jobs) {
    await db.transaction(async (trx) => {
      await trx('backup_jobs').del();
      if (jobs.length) await trx('backup_jobs').insert(jobs);
    });
  },

  async replaceSyncedRepositories(repositories) {
    await db.transaction(async (trx) => {
      await trx('backup_repositories').del();
      if (repositories.length) await trx('backup_repositories').insert(repositories);
    });
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
