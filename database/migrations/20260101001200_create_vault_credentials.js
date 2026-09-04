/**
 * Bóveda de contraseñas: credenciales de aplicaciones (vinculadas a una
 * caja de categoría "Aplicación" del mapa de topología, column_index=1)
 * o de dispositivos (vinculadas a un ítem del inventario de hardware).
 * Exactamente uno de los dos vínculos según `type` — se valida acá con
 * un CHECK (más la categoría correcta de la caja, que requiere mirar
 * `topology_nodes.column_index`, se valida en el service). El secreto
 * se guarda cifrado (AES-256-GCM, ver utils/crypto.js) — nunca en
 * texto plano.
 *
 * Se borra en cascada si se borra la caja de aplicación o el ítem de
 * hardware al que está vinculada: una credencial sin destino ya no
 * tiene sentido y quedaría huérfana e inmanejable desde la UI.
 */

/** @param { import("knex").Knex } knex */
export async function up(knex) {
  await knex.schema.createTable('vault_credentials', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('type', 20).notNullable();
    table.string('name', 200).notNullable();
    table.string('username', 200).nullable();
    table.text('secret_encrypted').notNullable();
    table.string('notes', 300).nullable();
    table.uuid('target_node_id').nullable().references('id').inTable('topology_nodes').onDelete('CASCADE');
    table.uuid('target_hardware_id').nullable().references('id').inTable('hardware_inventory').onDelete('CASCADE');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('created_by').nullable().references('id').inTable('users');
    table.uuid('updated_by').nullable().references('id').inTable('users');

    table.check("type IN ('application', 'device')", [], 'vault_credentials_type_check');
    table.check(
      "(type = 'application' AND target_node_id IS NOT NULL AND target_hardware_id IS NULL) OR " +
        "(type = 'device' AND target_hardware_id IS NOT NULL AND target_node_id IS NULL)",
      [],
      'vault_credentials_target_check'
    );
    table.index('target_node_id');
    table.index('target_hardware_id');
  });
}

/** @param { import("knex").Knex } knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('vault_credentials');
}
