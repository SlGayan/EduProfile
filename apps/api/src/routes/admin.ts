import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/authMiddleware.js';
import { getAdminDashboard } from '../modules/admin-dashboard/admin-dashboard.controller.js';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['ADMINISTRATOR']));

router.get('/dashboard', getAdminDashboard);

export default router;
