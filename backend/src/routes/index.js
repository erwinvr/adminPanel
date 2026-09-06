/**
 * routes/index.js
 *
 * Punto único donde se registran los routers de cada recurso bajo el
 * prefijo /api. app.js solo conoce este archivo, nunca los routers
 * individuales directamente.
 */

import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import roleRoutes from './role.routes.js';
import permissionRoutes from './permission.routes.js';
import auditRoutes from './audit.routes.js';
import topologyRoutes from './topology.routes.js';
import providerRoutes from './provider.routes.js';
import licenseRoutes from './license.routes.js';
import inventoryRoutes from './inventory.routes.js';
import officeRoutes from './office.routes.js';
import vaultRoutes from './vault.routes.js';
import adRoutes from './ad.routes.js';
import insightsRoutes from './insights.routes.js';
import shareRoutes from './share.routes.js';
import publicRoutes from './public.routes.js';
import backupRoutes from './backup.routes.js';
import vulnRoutes from './vuln.routes.js';
import netbackupRoutes from './netbackup.routes.js';
import complianceRoutes from './compliance.routes.js';
import smtpRoutes from './smtp.routes.js';
import m365Routes from './m365.routes.js';
import networkTopologyRoutes from './networkTopology.routes.js';

const router = Router();

router.use(healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/permissions', permissionRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/topology', topologyRoutes);
router.use('/providers', providerRoutes);
router.use('/licenses', licenseRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/offices', officeRoutes);
router.use('/vault', vaultRoutes);
router.use('/ad', adRoutes);
router.use('/insights', insightsRoutes);
router.use('/shares', shareRoutes);
router.use('/public', publicRoutes);
router.use('/backups', backupRoutes);
router.use('/vuln', vulnRoutes);
// Montada ANTES de "/netbackup" a propósito: es más específica
// ("/netbackup/compliance"), y aunque Express normalmente sigue
// probando el próximo middleware si un sub-router no matchea nada,
// mejor no depender de ese fallthrough.
router.use('/netbackup/compliance', complianceRoutes);
router.use('/netbackup', netbackupRoutes);
router.use('/smtp', smtpRoutes);
router.use('/m365', m365Routes);
router.use('/network-topology', networkTopologyRoutes);

export default router;
