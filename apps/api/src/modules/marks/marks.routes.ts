import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware.js';
import { importMarks, createMark, getMyMarks, getClassMarks } from './marks.controller.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  '/import',
  verifyToken,
  requireRole(['TEACHER']),
  upload.single('file'),
  importMarks
);

router.post('/', verifyToken, requireRole(['TEACHER']), createMark);

router.get('/my-marks', verifyToken, requireRole(['STUDENT']), getMyMarks);

router.get('/class-marks', verifyToken, requireRole(['TEACHER']), getClassMarks);

export default router;
