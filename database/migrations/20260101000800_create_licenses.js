/**
 * Licencias de software, con vínculo OPCIONAL a un proveedor (relación
 * simple muchos-a-uno, a diferencia de proveedores↔aplicaciones que es
 * muchos-a-muchos vía tabla intermedia). Si se borra el proveedor, la
 * licencia no se borra — solo queda sin proveedor asignado
 * (ON DELETE SET NULL), porque la licencia sigue siendo un activo real
 * de la organización independientemente de quién la haya vendido.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('licenses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 200).notNullable();
    table.uuid('provider_id').nullable().references('id').inTable('providers').onDelete('SET NULL');
    table.string('license_key', 300).nullable();
    table.integer('seats').nullable();
    table.date('expires_at').nullable();
    table.string('notes', 300).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('created_by').nullable().references('id').inTable('users');
    table.uuid('updated_by').nullable().references('id').inTable('users');

    table.check('seats IS NULL OR seats > 0', [], 'licenses_seats_positive_check');
    table.index('provider_id');
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('licenses');
}
