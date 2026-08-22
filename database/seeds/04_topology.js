/**
 * Datos de ejemplo del mapa de topología — SOLO se insertan si la tabla
 * está vacía (a diferencia de los demás seeds, este es de "primera
 * carga", no de catálogo fijo: una vez que el equipo empieza a editar
 * el mapa real, no queremos que un re-seed accidental lo pise).
 */

/** @param { import("knex").Knex } knex */
export async function seed(knex) {
  const [{ count }] = await knex('topology_nodes').count({ count: '*' });
  if (Number(count) > 0) {
    return; // ya hay datos reales — no tocar
  }

  const crit = await knex('topology_nodes')
    .insert([
      { column_index: 0, name: 'Crítico', sub: 'Impacto severo', color: '#e5484d' },
      { column_index: 0, name: 'Alto', sub: 'Impacto alto', color: '#e08a2c' },
      { column_index: 0, name: 'Medio', sub: 'Impacto moderado', color: '#d4b106' },
      { column_index: 0, name: 'Bajo', sub: 'Impacto menor', color: '#059669' },
    ])
    .returning(['id', 'name']);

  const apps = await knex('topology_nodes')
    .insert([
      { column_index: 1, name: 'osTicket', sub: 'Mesa de ayuda' },
      { column_index: 1, name: 'ERP (Upon Soft)', sub: 'Sin conectar aún' },
      { column_index: 1, name: 'Iqus (Fianzas)', sub: 'Sin conectar aún' },
      { column_index: 1, name: 'eProperty2', sub: 'Sin conectar aún' },
      { column_index: 1, name: 'Tableau Server', sub: 'Sin conectar aún' },
      { column_index: 1, name: 'eSalud', sub: 'Sin conectar aún' },
      { column_index: 1, name: 'eLife II', sub: 'Sin conectar aún' },
      { column_index: 1, name: 'DWH', sub: 'Sin conectar aún' },
    ])
    .returning(['id', 'name']);

  const [db1] = await knex('topology_nodes')
    .insert({ column_index: 2, name: 'MariaDB', sub: 'osticket_db' })
    .returning(['id', 'name']);

  const [srv1] = await knex('topology_nodes')
    .insert({ column_index: 3, name: 'VM Azure', sub: 'osTicket host' })
    .returning(['id', 'name']);

  await knex('topology_nodes').insert([
    { column_index: 4, name: 'Azure', sub: 'Cloud' },
    { column_index: 4, name: 'CDP', sub: 'On-prem' },
    { column_index: 4, name: 'CDS', sub: 'On-prem' },
  ]);
  const [azure] = await knex('topology_nodes').where({ name: 'Azure', column_index: 4 }).select('id');

  const osTicket = apps.find((a) => a.name === 'osTicket');
  const medio = crit.find((c) => c.name === 'Medio');

  await knex('topology_edges').insert([
    { from_node_id: osTicket.id, to_node_id: db1.id },
    { from_node_id: db1.id, to_node_id: srv1.id },
    { from_node_id: srv1.id, to_node_id: azure.id },
    { from_node_id: medio.id, to_node_id: osTicket.id },
  ]);
}
