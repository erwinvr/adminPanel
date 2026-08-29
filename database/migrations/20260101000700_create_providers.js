/**
 * Proveedores (vendors) y su vínculo con los recursos del mapa de
 * topología a los que abastecen: Aplicación, Base de Datos, Servidor/
 * Instancia o Datacenter/Nube (topology_nodes con column_index 1-4 —
 * Criticidad, column_index 0, no es un recurso real, es una
 * clasificación, así que queda excluida; se valida en el service, no
 * acá). Mismo patrón que topology_nodes/topology_edges: sin soft
 * delete (no hay razón de auditoría legal para este catálogo), pero
 * con integridad referencial real vía FKs.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('providers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 200).notNullable();
    table.string('contact_email', 200).nullable();
    table.string('contact_phone', 50).nullable();
    table.string('notes', 300).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('created_by').nullable().references('id').inTable('users');
    table.uuid('updated_by').nullable().references('id').inTable('users');
  });

  await knex.schema.createTable('provider_resources', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('provider_id').notNullable().references('id').inTable('providers').onDelete('CASCADE');
    table.uuid('node_id').notNullable().references('id').inTable('topology_nodes').onDelete('CASCADE');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('created_by').nullable().references('id').inTable('users');

    table.unique(['provider_id', 'node_id']);
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('provider_resources');
  await knex.schema.dropTableIfExists('providers');
}
