import { networkTopologyService } from '../services/networkTopology.service.js';

export async function getGraph(req, res) {
  const graph = await networkTopologyService.getGraph();
  res.status(200).json({ success: true, data: graph });
}
