import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware.js';
import {
  reviewStudentCertificate,
  downloadStudentCertificateFileForReview,
} from './studentCertificates.controller.js';

const router = Router();

// The student-scoped routes (submit/list/correct/download own file) live in
// routes/students.ts, and the teacher's pending-list lives in routes/teachers.ts
// — both share this module's controller so the authorization logic has one home.

router.patch('/:id/status', verifyToken, requireRole(['TEACHER', 'ADMINISTRATOR']), reviewStudentCertificate);

router.get('/:id/file', verifyToken, requireRole(['TEACHER', 'ADMINISTRATOR']), downloadStudentCertificateFileForReview);

export default router;
