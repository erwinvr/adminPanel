import { db } from '../config/database.js';

const LICENSE_COLUMNS = [
  'l.id',
  'l.name',
  'l.provider_id as providerId',
  'p.name as providerName',
  'l.license_key as licenseKey',
  'l.seats',
  'l.expires_at as expiresAt',
  'l.notes',
];

export const licenseRepository = {
  listLicenses() {
    return db('licenses as l').leftJoin('providers as p', 'p.id', 'l.provider_id').select(LICENSE_COLUMNS).orderBy('l.name');
  },

  findLicenseById(id) {
    return db('licenses').where({ id }).first();
  },
};
