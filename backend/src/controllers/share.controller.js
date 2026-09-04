import { shareService } from '../services/share.service.js';

export async function getStatus(req, res) {
  const status = await shareService.getStatus(req.params.dashboardKey);
  res.status(200).json({ success: true, data: status });
}

export async function createShare(req, res) {
  const status = await shareService.createShare(req, req.params.dashboardKey);
  res.status(200).json({ success: true, data: status });
}

export async function revokeShare(req, res) {
  await shareService.revokeShare(req, req.params.dashboardKey);
  res.status(204).send();
}

// Sin autenticación — ver routes/public.routes.js.
export async function getPublicDashboard(req, res) {
  const result = await shareService.getPublicDashboard(req, req.params.token);
  res.status(200).json({ success: true, data: result });
}
