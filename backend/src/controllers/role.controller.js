import { roleService } from '../services/role.service.js';

export async function listRoles(req, res) {
  const roles = await roleService.list();
  res.status(200).json({ success: true, data: roles });
}

export async function getRole(req, res) {
  const role = await roleService.getById(req.params.id);
  res.status(200).json({ success: true, data: role });
}

export async function createRole(req, res) {
  const role = await roleService.create(req, req.body);
  res.status(201).json({ success: true, data: role });
}

export async function updateRole(req, res) {
  const role = await roleService.update(req, req.params.id, req.body);
  res.status(200).json({ success: true, data: role });
}

export async function deleteRole(req, res) {
  await roleService.delete(req, req.params.id);
  res.status(204).send();
}
