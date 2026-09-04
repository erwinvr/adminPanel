import { vaultService } from '../services/vault.service.js';

export async function listCredentials(req, res) {
  const credentials = await vaultService.listCredentials();
  res.status(200).json({ success: true, data: credentials });
}

export async function listLinkedApplicationNodeIds(req, res) {
  const nodeIds = await vaultService.listLinkedApplicationNodeIds();
  res.status(200).json({ success: true, data: nodeIds });
}

export async function createCredential(req, res) {
  const credential = await vaultService.createCredential(req, req.body);
  res.status(201).json({ success: true, data: credential });
}

export async function updateCredential(req, res) {
  const credential = await vaultService.updateCredential(req, req.params.id, req.body);
  res.status(200).json({ success: true, data: credential });
}

export async function deleteCredential(req, res) {
  await vaultService.deleteCredential(req, req.params.id);
  res.status(204).send();
}

export async function revealSecret(req, res) {
  const secret = await vaultService.revealSecret(req, req.params.id);
  res.status(200).json({ success: true, data: { secret } });
}
