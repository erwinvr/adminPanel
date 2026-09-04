import { inventoryService } from '../services/inventory.service.js';

export async function listInventoryItems(req, res) {
  const items = await inventoryService.listItems();
  res.status(200).json({ success: true, data: items });
}

export async function createInventoryItem(req, res) {
  const item = await inventoryService.createItem(req, req.body);
  res.status(201).json({ success: true, data: item });
}

export async function updateInventoryItem(req, res) {
  const item = await inventoryService.updateItem(req, req.params.id, req.body);
  res.status(200).json({ success: true, data: item });
}

export async function deleteInventoryItem(req, res) {
  await inventoryService.deleteItem(req, req.params.id);
  res.status(204).send();
}
