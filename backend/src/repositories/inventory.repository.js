import { db } from '../config/database.js';

const INVENTORY_COLUMNS = [
  'h.id',
  'h.type',
  'h.brand',
  'h.model',
  'h.office_id as officeId',
  'o.name as officeName',
  'h.management_ip as managementIp',
  'h.has_support as hasSupport',
  'h.support_until as supportUntil',
  'h.support_provider_id as supportProviderId',
  'p.name as supportProviderName',
];

export const inventoryRepository = {
  listItems() {
    return db('hardware_inventory as h')
      .join('offices as o', 'o.id', 'h.office_id')
      .leftJoin('providers as p', 'p.id', 'h.support_provider_id')
      .select(INVENTORY_COLUMNS)
      .orderBy(['h.type', 'h.brand', 'h.model']);
  },

  findItemById(id) {
    return db('hardware_inventory').where({ id }).first();
  },
};
