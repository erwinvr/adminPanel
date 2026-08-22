/**
 * Persistencia del mapa de topología (Aplicación → Base de Datos →
 * Servidor → Datacenter → Criticidad), reemplazando el almacenamiento
 * en el navegador (window.storage del artifact original) por PostgreSQL
 * — mismo patrón que el resto del sistema: soft-nada aquí (no aplica
 * soft delete, no hay razón de auditoría legal para nodos de un
 * diagrama), pero sí claves foráneas e integridad referencial real.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('topology_nodes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // 0=Criticidad, 1=Aplicación, 2=Base de Datos, 3=Servidor/Instancia, 4=Datacenter/Nube
    table.smallint('column_index').notNullable();
    table.string('name', 200).notNullable();
    table.string('sub', 300).nullable();
    table.string('color', 20).nullable(); // hex opcional, usado por los 4 nodos fijos de Criticidad
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('created_by').nullable().references('id').inTable('users');
    table.uuid('updated_by').nullable().references('id').inTable('users');

    table.check('column_index BETWEEN 0 AND 4', [], 'topology_nodes_column_check');
    table.index('column_index');
  });

  await knex.schema.createTable('topology_edges', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('from_node_id').notNullable().references('id').inTable('topology_nodes').onDelete('CASCADE');
    table.uuid('to_node_id').notNullable().references('id').inTable('topology_nodes').onDelete('CASCADE');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('created_by').nullable().references('id').inTable('users');

    table.unique(['from_node_id', 'to_node_id']);
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('topology_edges');
  await knex.schema.dropTableIfExists('topology_nodes');
}
