import { Router } from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { importMarks, getMyMarks, getClassMarks } from './marks.controller.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  '/import',
  authenticateToken,
  requireRole('teacher'),
  upload.single('file'),
  importMarks
);

router.get('/my-marks', authenticateToken, requireRole('student'), getMyMarks);

router.get('/class-marks', authenticateToken, requireRole('teacher'), getClassMarks);

export default router;
