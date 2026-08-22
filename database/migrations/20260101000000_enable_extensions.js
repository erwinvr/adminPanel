/**
 * Migración de infraestructura: habilita la extensión pgcrypto, necesaria
 * para `gen_random_uuid()` que se usará como default de las claves
 * primarias UUID en las tablas de negocio (creadas en la Fase 4 — RBAC).
 *
 * Se separa en su propia migración porque es un cambio de infraestructura
 * de la base de datos, no de un recurso de negocio en particular.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.raw('DROP EXTENSION IF EXISTS pgcrypto');
}
