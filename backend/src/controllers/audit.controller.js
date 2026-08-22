import { auditRepository } from '../repositories/audit.repository.js';

export async function listAuditLogs(req, res) {
  const result = await auditRepository.list(req.query);
  res.status(200).json({ success: true, data: result.items, meta: { pagination: result.pagination } });
}
