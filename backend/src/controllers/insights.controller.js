import { insightsService } from '../services/insights.service.js';

export async function getUserSecurityInsights(req, res) {
  const data = await insightsService.getUserSecurityInsights();
  res.status(200).json({ success: true, data });
}
