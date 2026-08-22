/**
 * Tablas del modelo RBAC: roles, permissions y sus tablas puente.
 * Ver decisión de arquitectura (Fase 1): sin permisos directos por
 * usuario — los permisos efectivos son siempre la unión de los permisos
 * de los roles asignados.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 100).notNullable().unique();
    table.text('description').nullable();
    // Roles de sistema (ej. 'administrator') no pueden borrarse ni
    // renombrarse desde la UI — protección aplicada en el service.
    table.boolean('is_system').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('permissions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('code', 100).notNullable().unique(); // ej. 'users.create'
    table.string('module', 50).notNullable(); // ej. 'users'
    table.text('description').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('module');
  });

  await knex.schema.createTable('user_roles', (table) => {
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('RESTRICT');
    table.timestamp('assigned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('assigned_by').nullable().references('id').inTable('users');

    table.primary(['user_id', 'role_id']);
  });

  await knex.schema.createTable('role_permissions', (table) => {
    table.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    table.uuid('permission_id').notNullable().references('id').inTable('permissions').onDelete('RESTRICT');
    table.timestamp('assigned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('assigned_by').nullable().references('id').inTable('users');

    table.primary(['role_id', 'permission_id']);
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('user_roles');
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('roles');
}
