import { db } from '../config/database.js';

export const officeRepository = {
  listOffices() {
    return db('offices').select('id', 'name', 'address').orderBy('name');
  },

  findOfficeById(id) {
    return db('offices').where({ id }).first();
  },

  countHardwareByOffice(officeId) {
    return db('hardware_inventory').where({ office_id: officeId }).count('id as count').first();
  },
};
