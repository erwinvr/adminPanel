/**
 * Crea el rol de sistema 'administrator' con TODOS los permisos del
 * catálogo, y el rol 'auditor' (solo lectura de auditoría) como ejemplo
 * de rol no-administrativo. `is_system: true` en 'administrator' evita
 * que se borre o renombre accidentalmente desde la UI (Fase 6).
 */
import { PERMISSIONS } from '../../backend/src/permissions/catalog.js';

/** @param { import("knex").Knex } knex */
export async function seed(knex) {
  const allPermissions = await knex('permissions').select('id', 'code');

  const [adminRole] = await knex('roles')
    .insert({ name: 'administrator', description: 'Acceso total al sistema', is_system: true })
    .onConflict('name')
    .merge(['description', 'is_system'])
    .returning(['id']);

  await knex('role_permissions').where({ role_id: adminRole.id }).del();
  await knex('role_permissions').insert(
    allPermissions.map((p) => ({ role_id: adminRole.id, permission_id: p.id }))
  );

  const [auditorRole] = await knex('roles')
    .insert({ name: 'auditor', description: 'Solo lectura del registro de auditoría', is_system: false })
    .onConflict('name')
    .merge(['description'])
    .returning(['id']);

  const auditPermission = allPermissions.find((p) => p.code === PERMISSIONS.AUDIT_VIEW);
  await knex('role_permissions').where({ role_id: auditorRole.id }).del();
  if (auditPermission) {
    await knex('role_permissions').insert({ role_id: auditorRole.id, permission_id: auditPermission.id });
  }
}
