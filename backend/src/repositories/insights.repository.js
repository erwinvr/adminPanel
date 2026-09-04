import { db } from '../config/database.js';

const STALE_DAYS = 90;

function staleCutoff() {
  return db.raw(`now() - interval '${STALE_DAYS} days'`);
}

// Panel "Usuarios" del dashboard: cruza ad_users (foto del último sync
// de Active Directory) con m365_users (foto del último sync de
// Microsoft 365) — ambos ya existen y se pueblan por su respectiva
// sincronización, acá solo se consultan de solo lectura.
export const insightsRepository = {
  countAdUsers() {
    return db('ad_users')
      .count({ count: '*' })
      .first()
      .then((r) => Number(r.count));
  },

  countM365Users() {
    return db('m365_users')
      .count({ count: '*' })
      .first()
      .then((r) => Number(r.count));
  },

  countAdUsersWithStaleLogin() {
    return db('ad_users')
      .where((qb) => qb.whereNull('last_login_at').orWhere('last_login_at', '<', staleCutoff()))
      .count({ count: '*' })
      .first()
      .then((r) => Number(r.count));
  },

  countAdUsersWithStalePassword() {
    return db('ad_users')
      .where((qb) => qb.whereNull('password_last_set_at').orWhere('password_last_set_at', '<', staleCutoff()))
      .count({ count: '*' })
      .first()
      .then((r) => Number(r.count));
  },

  // "NULLS FIRST" en ambos: un usuario que nunca cambió la clave o
  // nunca inició sesión es más urgente que uno que lo hizo hace 91
  // días, así que encabeza el ranking.
  topAdUsersByStalePassword(limit = 10) {
    return db('ad_users')
      .select('id', 'display_name as displayName', 'sam_account_name as samAccountName', 'password_last_set_at as passwordLastSetAt')
      .where((qb) => qb.whereNull('password_last_set_at').orWhere('password_last_set_at', '<', staleCutoff()))
      .orderByRaw('password_last_set_at ASC NULLS FIRST')
      .limit(limit);
  },

  topAdUsersByStaleLogin(limit = 10) {
    return db('ad_users')
      .select('id', 'display_name as displayName', 'sam_account_name as samAccountName', 'last_login_at as lastLoginAt')
      .where((qb) => qb.whereNull('last_login_at').orWhere('last_login_at', '<', staleCutoff()))
      .orderByRaw('last_login_at ASC NULLS FIRST')
      .limit(limit);
  },
};
