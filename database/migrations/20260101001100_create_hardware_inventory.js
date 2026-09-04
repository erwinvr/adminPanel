/**
 * Inventario de hardware físico (servidores, networking y energía). La
 * ubicación es un vínculo OBLIGATORIO a una oficina del catálogo
 * `offices` (no texto libre) — no se puede borrar una oficina mientras
 * tenga hardware asignado (ON DELETE RESTRICT). El soporte de fábrica
 * es opcional: si `has_support` es true, puede completarse hasta qué
 * fecha vence y qué proveedor lo brinda (vínculo OPCIONAL a un
 * proveedor, igual que en licencias — si se borra el proveedor el
 * ítem no se borra, solo queda sin proveedor de soporte asignado).
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('hardware_inventory', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('type', 30).notNullable();
    table.string('brand', 150).notNullable();
    table.string('model', 150).notNullable();
    table.uuid('office_id').notNullable().references('id').inTable('offices').onDelete('RESTRICT');
    table.boolean('has_support').notNullable().defaultTo(false);
    table.date('support_until').nullable();
    table.uuid('support_provider_id').nullable().references('id').inTable('providers').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('created_by').nullable().references('id').inTable('users');
    table.uuid('updated_by').nullable().references('id').inTable('users');

    table.check("type IN ('servidor', 'networking', 'energia')", [], 'hardware_inventory_type_check');
    table.index('office_id');
    table.index('support_provider_id');
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('hardware_inventory');
}
