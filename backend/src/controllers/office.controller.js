import { officeService } from '../services/office.service.js';

export async function listOffices(req, res) {
  const offices = await officeService.listOffices();
  res.status(200).json({ success: true, data: offices });
}

export async function createOffice(req, res) {
  const office = await officeService.createOffice(req, req.body);
  res.status(201).json({ success: true, data: office });
}

export async function updateOffice(req, res) {
  const office = await officeService.updateOffice(req, req.params.id, req.body);
  res.status(200).json({ success: true, data: office });
}

export async function deleteOffice(req, res) {
  await officeService.deleteOffice(req, req.params.id);
  res.status(204).send();
}
