import { providerService } from '../services/provider.service.js';

export async function listProviders(req, res) {
  const providers = await providerService.listProviders();
  res.status(200).json({ success: true, data: providers });
}

export async function createProvider(req, res) {
  const provider = await providerService.createProvider(req, req.body);
  res.status(201).json({ success: true, data: provider });
}

export async function updateProvider(req, res) {
  const provider = await providerService.updateProvider(req, req.params.id, req.body);
  res.status(200).json({ success: true, data: provider });
}

export async function deleteProvider(req, res) {
  await providerService.deleteProvider(req, req.params.id);
  res.status(204).send();
}

export async function setResources(req, res) {
  const resources = await providerService.setResources(req, req.params.id, req.body.nodeIds);
  res.status(200).json({ success: true, data: { resources } });
}
