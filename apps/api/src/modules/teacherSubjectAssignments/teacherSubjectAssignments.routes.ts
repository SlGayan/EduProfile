import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware.js';
import { createAssignment, deleteAssignment } from './teacherSubjectAssignments.controller.js';

const router = Router();

// The class-scoped list route (GET /api/classes/:id/subject-assignments) lives
// in routes/classes.ts, because that router owns the /api/classes mount. It
// shares this module's controller (listAssignmentsForClass) so the
// authorization logic has one home.

router.post('/', verifyToken, requireRole(['ADMINISTRATOR', 'PRINCIPAL']), createAssignment);

router.delete('/:id', verifyToken, requireRole(['ADMINISTRATOR', 'PRINCIPAL']), deleteAssignment);

export default router;
