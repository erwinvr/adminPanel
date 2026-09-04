import { db } from '../config/database.js';

export const shareRepository = {
  findActiveByDashboardKey(dashboardKey) {
    return db('dashboard_shares').where({ dashboard_key: dashboardKey, revoked_at: null }).first();
  },

  findActiveByToken(token) {
    return db('dashboard_shares').where({ token, revoked_at: null }).first();
  },

  create({ dashboardKey, token, actorId }) {
    return db('dashboard_shares')
      .insert({ dashboard_key: dashboardKey, token, created_by: actorId })
      .returning('*')
      .then(([row]) => row);
  },

  revoke(id) {
    return db('dashboard_shares').where({ id }).update({ revoked_at: db.fn.now() });
  },

  recordAccess(id) {
    return db('dashboard_shares')
      .where({ id })
      .update({ last_accessed_at: db.fn.now(), access_count: db.raw('access_count + 1') });
  },
};
