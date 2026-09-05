import { complianceService } from '../services/compliance.service.js';

export async function listRules(req, res) {
  const rules = await complianceService.listRules();
  res.status(200).json({ success: true, data: rules });
}

export async function createRule(req, res) {
  const rule = await complianceService.createRule(req, req.body);
  res.status(201).json({ success: true, data: rule });
}

export async function updateRule(req, res) {
  const rule = await complianceService.updateRule(req, req.params.id, req.body);
  res.status(200).json({ success: true, data: rule });
}

export async function deleteRule(req, res) {
  await complianceService.deleteRule(req, req.params.id);
  res.status(204).send();
}

export async function getSummary(req, res) {
  const summary = await complianceService.getSummary();
  res.status(200).json({ success: true, data: summary });
}

export async function getDeviceResults(req, res) {
  const results = await complianceService.getDeviceResults(req.params.id);
  res.status(200).json({ success: true, data: results });
}
