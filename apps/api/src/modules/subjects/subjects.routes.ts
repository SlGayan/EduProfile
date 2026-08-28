import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware.js';
import { listSubjects, createSubject } from './subjects.controller.js';

const router = Router();

router.get('/', verifyToken, requireRole(['TEACHER', 'ADMINISTRATOR', 'PRINCIPAL']), listSubjects);

router.post('/', verifyToken, requireRole(['ADMINISTRATOR']), createSubject);

export default router;
