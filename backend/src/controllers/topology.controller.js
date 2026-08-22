import { topologyService } from '../services/topology.service.js';

export async function getGraph(req, res) {
  const graph = await topologyService.getGraph();
  res.status(200).json({ success: true, data: graph });
}

export async function createNode(req, res) {
  const node = await topologyService.createNode(req, req.body);
  res.status(201).json({ success: true, data: node });
}

export async function updateNode(req, res) {
  const node = await topologyService.updateNode(req, req.params.id, req.body);
  res.status(200).json({ success: true, data: node });
}

export async function deleteNode(req, res) {
  await topologyService.deleteNode(req, req.params.id);
  res.status(204).send();
}

export async function createEdge(req, res) {
  const edge = await topologyService.createEdge(req, req.body);
  res.status(201).json({ success: true, data: edge });
}

export async function deleteEdge(req, res) {
  await topologyService.deleteEdge(req, req.params.id);
  res.status(204).send();
}
