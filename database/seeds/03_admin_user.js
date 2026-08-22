/**
 * Crea el usuario administrador inicial. Requiere que las variables de
 * entorno ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD estén
 * definidas — a propósito NO hay una contraseña por defecto hardcodeada:
 * eso sería un hallazgo de seguridad crítico en cualquier revisión (un
 * admin/admin de fábrica es uno de los primeros vectores que se prueban
 * contra cualquier sistema expuesto). El usuario queda con
 * `must_change_password = true`.
 */
import '../../backend/src/config/env.js'; // efecto secundario: carga y valida el .env
import { hashPassword, checkPasswordPolicy } from '../../backend/src/auth/password.js';

/** @param { import("knex").Knex } knex */
export async function seed(knex) {
  const username = process.env.ADMIN_USERNAME;
  const email = process.env.ADMIN_EMAIL;
  const plainPassword = process.env.ADMIN_INITIAL_PASSWORD;

  if (!username || !email || !plainPassword) {
    throw new Error(
      'Faltan variables de entorno para crear el usuario administrador inicial: ' +
        'ADMIN_USERNAME, ADMIN_EMAIL y ADMIN_INITIAL_PASSWORD son obligatorias. ' +
        'Definirlas en .env antes de correr "npm run seed:run".'
    );
  }

  const policy = checkPasswordPolicy(plainPassword);
  if (!policy.valid) {
    throw new Error(`ADMIN_INITIAL_PASSWORD no cumple la política mínima: ${policy.reasons.join('; ')}`);
  }

  const passwordHash = await hashPassword(plainPassword);

  const [adminUser] = await knex('users')
    .insert({
      first_name: 'Administrador',
      last_name: 'Sistema',
      username,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      status: 'active',
      must_change_password: true,
    })
    .onConflict('username')
    .merge(['email']) // si ya existe, no se pisa la contraseña en corridas repetidas
    .returning(['id']);

  const adminRole = await knex('roles').where({ name: 'administrator' }).first();

  await knex('user_roles')
    .insert({ user_id: adminUser.id, role_id: adminRole.id })
    .onConflict(['user_id', 'role_id'])
    .ignore();
}
