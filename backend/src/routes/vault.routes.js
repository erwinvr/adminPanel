import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validate.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { createVaultCredentialSchema, updateVaultCredentialSchema } from '../validators/vault.validator.js';
import * as vaultController from '../controllers/vault.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.VAULT_VIEW), asyncHandler(vaultController.listCredentials));

// Ruta fija ANTES de "/:id/..." — si no, Express intentaría matchear
// "linked-application-nodes" como si fuera un :id.
router.get(
  '/linked-application-nodes',
  requirePermission(PERMISSIONS.VAULT_VIEW),
  asyncHandler(vaultController.listLinkedApplicationNodeIds)
);

router.post(
  '/',
  requirePermission(PERMISSIONS.VAULT_EDIT),
  validateBody(createVaultCredentialSchema),
  asyncHandler(vaultController.createCredential)
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.VAULT_EDIT),
  validateBody(updateVaultCredentialSchema),
  asyncHandler(vaultController.updateCredential)
);

router.delete('/:id', requirePermission(PERMISSIONS.VAULT_EDIT), asyncHandler(vaultController.deleteCredential));

// POST (no GET) a propósito: revelar un secreto es una acción sensible
// y auditada, no una simple lectura cacheable — no queremos que quede
// en logs de proxy/historial de navegador como una URL más.
router.post('/:id/reveal', requirePermission(PERMISSIONS.VAULT_VIEW), asyncHandler(vaultController.revealSecret));

export default router;
