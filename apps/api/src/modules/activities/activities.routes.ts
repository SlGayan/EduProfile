import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware.js';
import { updateActivity, deleteActivity } from './activities.controller.js';

const router = Router();

// The student-scoped routes (POST/GET /api/students/:id/activities) live in
// routes/students.ts, because that router owns the /api/students mount. Both
// sets share this module's controller so the authorization logic has one home.

router.put('/:id', verifyToken, requireRole(['TEACHER', 'ADMINISTRATOR']), updateActivity);

router.delete('/:id', verifyToken, requireRole(['TEACHER', 'ADMINISTRATOR']), deleteActivity);

export default router;
