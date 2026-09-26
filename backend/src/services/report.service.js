/**
 * services/report.service.js
 *
 * Sección "Reportes": ejecuta un reporte del catálogo (reports/reportCatalog.js)
 * con sus filtros (fechas, buscador, umbrales propios), lo pagina para la
 * pantalla y lo exporta a CSV. La exportación lleva TODAS las filas que
 * cumplen los filtros activos (no solo la página visible) y queda registrada
 * en Auditoría.
 */

import Joi from 'joi';
import { db } from '../config/database.js';
import { REPORTS, findReport, describeReport } from '../reports/reportCatalog.js';
import { toCsv } from '../reports/csvWriter.js';
import { recordEvent } from '../audit/audit.service.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

const EXPORT_CHUNK = 1000;
const MAX_EXPORT_ROWS = 100000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function getReport(key) {
  const report = findReport(key);
  if (!report) throw new NotFoundError('Reporte no encontrado');
  return report;
}

/** Valida los filtros comunes + los umbrales propios de ESTE reporte. */
function resolveFilters(report, rawQuery) {
  const paramSchemas = Object.fromEntries(
    report.params.map((p) => [p.name, Joi.number().min(p.min).max(p.max).default(p.default)])
  );
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    from: Joi.string().pattern(DAY),
    to: Joi.string().pattern(DAY),
    search: Joi.string().trim().max(200).allow(''),
    format: Joi.string().valid('std', 'es').default('std'),
    ...paramSchemas,
  });
  const { error, value } = schema.validate(rawQuery, { abortEarly: false, stripUnknown: true });
  if (error) {
    throw new ValidationError('Parámetros del reporte no válidos', error.details.map((d) => ({ field: d.path.join('.'), message: d.message })));
  }
  if (value.from && value.to && value.from > value.to) {
    throw new ValidationError('La fecha "Desde" no puede ser posterior a "Hasta"');
  }
  const params = Object.fromEntries(report.params.map((p) => [p.name, value[p.name]]));
  return { page: value.page, pageSize: value.pageSize, from: value.from, to: value.to, search: value.search, format: value.format, params };
}

/** Consulta del reporte con los filtros aplicados (sin ejecutar ni ordenar). */
function buildQuery(report, { from, to, search, params }) {
  const query = report.build(params);

  if (report.dateExpression) {
    if (from) query.whereRaw(`${report.dateExpression} >= ?`, [from]);
    if (to) query.whereRaw(`${report.dateExpression} <= ?`, [to]);
  }

  // Cada término debe aparecer (sin mayúsculas ni tildes) en alguna de las columnas de búsqueda.
  const terms = (search ?? '').split(/\s+/).filter(Boolean).slice(0, 8);
  if (report.searchColumns?.length && terms.length) {
    for (const term of terms) {
      const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
      query.where((qb) => {
        for (const column of report.searchColumns) qb.orWhereRaw('unaccent(lower(??)) like unaccent(lower(?))', [column, pattern]);
      });
    }
  }
  return query;
}

const finishRow = (report) => (report.mapRow ? (row) => report.mapRow(row) : (row) => row);

export const reportService = {
  list() {
    return REPORTS.map(describeReport);
  },

  async run(key, rawQuery) {
    const report = getReport(key);
    const filters = resolveFilters(report, rawQuery);
    const query = buildQuery(report, filters);

    const [{ n }] = await db.count({ n: '*' }).from(query.clone().clearOrder().as('r'));
    const rows = await query
      .clone()
      .orderBy(report.orderBy)
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize);

    const total = Number(n);
    return {
      items: rows.map(finishRow(report)),
      pagination: { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.max(1, Math.ceil(total / filters.pageSize)) },
    };
  },

  /** CSV con todas las filas que cumplen los filtros; devuelve `{ filename, csv, rowCount }`. */
  async exportCsv(req, key, rawQuery) {
    const report = getReport(key);
    const filters = resolveFilters(report, rawQuery);
    const query = buildQuery(report, filters);

    const [{ n }] = await db.count({ n: '*' }).from(query.clone().clearOrder().as('r'));
    if (Number(n) > MAX_EXPORT_ROWS) {
      throw new ValidationError(`El reporte tiene ${n} filas y el máximo exportable es ${MAX_EXPORT_ROWS}: acotalo con filtros`);
    }

    const rows = [];
    for (let offset = 0; offset < Number(n); offset += EXPORT_CHUNK) {
      const chunk = await query.clone().orderBy(report.orderBy).limit(EXPORT_CHUNK).offset(offset);
      rows.push(...chunk.map(finishRow(report)));
    }

    await recordEvent({
      userId: req.session.userId,
      action: 'report.export',
      resource: 'report',
      resourceId: key,
      result: 'success',
      req,
      metadata: { rowCount: rows.length, format: filters.format, from: filters.from, to: filters.to, search: filters.search || undefined, params: filters.params },
    });

    const today = new Date().toISOString().slice(0, 10);
    return { filename: `reporte-${key}-${today}.csv`, csv: toCsv({ columns: report.columns, rows, format: filters.format }), rowCount: rows.length };
  },
};
