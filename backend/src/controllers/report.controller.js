import { reportService } from '../services/report.service.js';

export async function listReports(req, res) {
  res.status(200).json({ success: true, data: reportService.list() });
}

export async function runReport(req, res) {
  const { items, pagination } = await reportService.run(req.params.key, req.query);
  res.status(200).json({ success: true, data: items, meta: { pagination } });
}

export async function exportReport(req, res) {
  const { filename, csv } = await reportService.exportCsv(req, req.params.key, req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csv);
}
