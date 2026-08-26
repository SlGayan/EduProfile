import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware.js';
import { listSubjects } from './subjects.controller.js';

const router = Router();

router.get('/', verifyToken, requireRole(['TEACHER', 'ADMINISTRATOR', 'PRINCIPAL']), listSubjects);

export default router;
