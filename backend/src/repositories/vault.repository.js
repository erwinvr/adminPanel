import { db } from '../config/database.js';

// Nunca incluye `secret_encrypted` — el listado es metadata solamente;
// el secreto en texto plano solo sale por `vaultService.revealSecret`,
// que audita cada acceso (ver services/vault.service.js).
const CREDENTIAL_COLUMNS = [
  'v.id',
  'v.type',
  'v.name',
  'v.username',
  'v.notes',
  'v.target_node_id as targetNodeId',
  'n.name as targetNodeName',
  'v.target_hardware_id as targetHardwareId',
  'h.brand as targetHardwareBrand',
  'h.model as targetHardwareModel',
];

export const vaultRepository = {
  listCredentials() {
    return db('vault_credentials as v')
      .leftJoin('topology_nodes as n', 'n.id', 'v.target_node_id')
      .leftJoin('hardware_inventory as h', 'h.id', 'v.target_hardware_id')
      .select(CREDENTIAL_COLUMNS)
      .orderBy(['v.type', 'v.name']);
  },

  findCredentialById(id) {
    return db('vault_credentials').where({ id }).first();
  },

  // IDs de cajas de aplicación (column_index=1) que tienen al menos una
  // credencial — usado por el mapa de topología para el símbolo de
  // "vinculada a la bóveda", sin exponer nombre/usuario de la
  // credencial a quien solo tiene permiso de ver el mapa.
  async listLinkedApplicationNodeIds() {
    const rows = await db('vault_credentials').where({ type: 'application' }).distinct('target_node_id');
    return rows.map((r) => r.target_node_id);
  },
};
