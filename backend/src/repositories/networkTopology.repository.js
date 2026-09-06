import { db } from '../config/database.js';

export const networkTopologyRepository = {
  // Hardware de tipo 'networking' marcado a propósito para participar
  // del grafo (ver hardware_inventory.include_in_topology) — LEFT JOIN
  // a netbackup_devices porque un equipo puede estar marcado sin tener
  // todavía backup configurado (aparece igual, como nodo aislado).
  listTopologyHardware() {
    return db('hardware_inventory as h')
      .leftJoin('netbackup_devices as d', 'd.hardware_id', 'h.id')
      .where('h.type', 'networking')
      .andWhere('h.include_in_topology', true)
      .select('h.id', 'h.brand', 'h.model', 'h.management_ip as managementIp', 'd.id as netbackupDeviceId', 'd.driver')
      .orderBy(['h.brand', 'h.model']);
  },
};
