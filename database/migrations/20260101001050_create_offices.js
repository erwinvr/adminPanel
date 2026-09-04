/**
 * Oficinas físicas de la organización — sirven como catálogo cerrado de
 * ubicaciones para el inventario de hardware (hardware_inventory.office_id),
 * en vez de texto libre repetido en cada ítem. La unicidad del nombre
 * es case-insensitive (índice sobre lower(name)) porque el service la
 * valida así (`office.service.js`) — un unique() común sobre `name`
 * quedaría corto y dejaría colar duplicados tipo "Sucursal Norte" /
 * "sucursal norte" bajo carga concurrente.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('offices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 150).notNullable();
    table.string('address', 300).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('created_by').nullable().references('id').inTable('users');
    table.uuid('updated_by').nullable().references('id').inTable('users');
  });

  await knex.raw('CREATE UNIQUE INDEX offices_name_lower_unique ON offices (lower(name))');
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('offices');
}
