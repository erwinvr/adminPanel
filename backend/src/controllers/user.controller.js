import { userService } from '../services/user.service.js';

export async function listUsers(req, res) {
  const result = await userService.list(req.query);
  res.status(200).json({ success: true, data: result.items, meta: { pagination: result.pagination } });
}

export async function getUser(req, res) {
  const user = await userService.getById(req.params.id);
  res.status(200).json({ success: true, data: user });
}

export async function createUser(req, res) {
  const user = await userService.create(req, req.body);
  res.status(201).json({ success: true, data: user });
}

export async function updateUser(req, res) {
  const user = await userService.update(req, req.params.id, req.body);
  res.status(200).json({ success: true, data: user });
}

export async function deactivateUser(req, res) {
  await userService.deactivate(req, req.params.id);
  res.status(204).send();
}
