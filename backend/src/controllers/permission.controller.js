import { permissionRepository } from '../repositories/permission.repository.js';

export async function listPermissions(req, res) {
  const permissions = await permissionRepository.listAll();
  res.status(200).json({ success: true, data: permissions });
}
