/**
 * services/office.service.js
 *
 * ABM de oficinas — catálogo cerrado de ubicaciones físicas usado por
 * el inventario de hardware (hardware_inventory.office_id). No se
 * puede eliminar una oficina mientras tenga hardware asignado.
 */

import { db } from '../config/database.js';
import { officeRepository } from '../repositories/office.repository.js';
import { recordEvent } from '../audit/audit.service.js';
import { ConflictError, NotFoundError } from '../errors/AppError.js';

const UNIQUE_VIOLATION = '23505';

// El chequeo de duplicados por nombre (case-insensitive) de acá abajo
// es solo el camino feliz para dar un mensaje claro sin ir a la base
// dos veces — la unicidad REAL la garantiza el índice
// `offices_name_lower_unique` (ver migración), así que dos altas
// concurrentes con el mismo nombre en distinta capitalización no
// pueden colar ambas: la que pierde la carrera cae acá y se traduce
// al mismo ConflictError en vez de propagar el error crudo de Postgres.
function isUniqueNameViolation(err) {
  return err?.code === UNIQUE_VIOLATION && err?.constraint === 'offices_name_lower_unique';
}

export const officeService = {
  listOffices() {
    return officeRepository.listOffices();
  },

  async createOffice(req, { name, address }) {
    const existing = await db('offices').whereRaw('lower(name) = lower(?)', [name]).first();
    if (existing) throw new ConflictError('Ya existe una oficina con ese nombre');

    const actorId = req.session.userId;

    try {
      const created = await db.transaction(async (trx) => {
        const [row] = await trx('offices')
          .insert({ name, address: address || null, created_by: actorId, updated_by: actorId })
          .returning(['id', 'name', 'address']);

        await recordEvent({
          userId: actorId,
          action: 'office.create',
          resource: 'office',
          resourceId: row.id,
          result: 'success',
          req,
          metadata: { name },
          trx,
        });

        return row;
      });

      return created;
    } catch (err) {
      if (isUniqueNameViolation(err)) throw new ConflictError('Ya existe una oficina con ese nombre');
      throw err;
    }
  },

  async updateOffice(req, id, changes) {
    const existing = await officeRepository.findOfficeById(id);
    if (!existing) throw new NotFoundError('Oficina no encontrada');

    if (changes.name !== undefined) {
      const conflict = await db('offices')
        .whereRaw('lower(name) = lower(?)', [changes.name])
        .whereNot({ id })
        .first();
      if (conflict) throw new ConflictError('Ya existe una oficina con ese nombre');
    }

    const actorId = req.session.userId;
    const dbChanges = {};
    if (changes.name !== undefined) dbChanges.name = changes.name;
    if (changes.address !== undefined) dbChanges.address = changes.address || null;

    try {
      await db.transaction(async (trx) => {
        await trx('offices').where({ id }).update({ ...dbChanges, updated_by: actorId, updated_at: trx.fn.now() });

        await recordEvent({
          userId: actorId,
          action: 'office.update',
          resource: 'office',
          resourceId: id,
          result: 'success',
          req,
          metadata: { changes: Object.keys(changes) },
          trx,
        });
      });
    } catch (err) {
      if (isUniqueNameViolation(err)) throw new ConflictError('Ya existe una oficina con ese nombre');
      throw err;
    }

    return officeRepository.findOfficeById(id);
  },

  async deleteOffice(req, id) {
    const existing = await officeRepository.findOfficeById(id);
    if (!existing) throw new NotFoundError('Oficina no encontrada');

    const { count } = await officeRepository.countHardwareByOffice(id);
    if (Number(count) > 0) {
      throw new ConflictError(`No se puede eliminar: hay ${count} ítem(s) de hardware asignados a esta oficina`);
    }

    const actorId = req.session.userId;

    await db.transaction(async (trx) => {
      await trx('offices').where({ id }).del();
      await recordEvent({
        userId: actorId,
        action: 'office.delete',
        resource: 'office',
        resourceId: id,
        result: 'success',
        req,
        metadata: { name: existing.name },
        trx,
      });
    });
  },
};
