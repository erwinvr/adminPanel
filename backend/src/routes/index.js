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
import m365Routes from './m365.routes.js';

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
router.use('/m365', m365Routes);

export default router;
