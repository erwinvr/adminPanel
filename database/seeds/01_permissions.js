/**
 * Seed idempotente: inserta el catálogo de permisos si no existen (por
 * código único). Se puede correr múltiples veces sin duplicar filas ni
 * fallar si ya existen — usa upsert vía ON CONFLICT.
 */
import { PERMISSION_DEFINITIONS } from '../../backend/src/permissions/catalog.js';

/** @param { import("knex").Knex } knex */
export async function seed(knex) {
  for (const perm of PERMISSION_DEFINITIONS) {
    await knex('permissions')
      .insert({ code: perm.code, module: perm.module, description: perm.description })
      .onConflict('code')
      .merge(['module', 'description']);
  }
}
