/**
 * Extensión `unaccent`: las búsquedas de texto del lado del servidor
 * (ej. usuarios de Microsoft 365) tienen que seguir encontrando "José"
 * al escribir "jose", como hacía el filtro del navegador. Es una
 * extensión "de confianza" (PostgreSQL 13+): la puede crear el dueño de
 * la base, no hace falta ser superusuario.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS unaccent');
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.raw('DROP EXTENSION IF EXISTS unaccent');
}
