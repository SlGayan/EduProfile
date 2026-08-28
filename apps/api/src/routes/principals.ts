import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/authMiddleware.js';
import { getPrincipalDashboard, getPendingMarksClasses } from '../modules/principal-dashboard/principal-dashboard.controller.js';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['PRINCIPAL', 'ADMINISTRATOR']));

router.get('/me/dashboard', getPrincipalDashboard);
router.get('/me/pending-marks', getPendingMarksClasses);

export default router;
