import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware.js';
import { getClassAnalytics, getSchoolAnalytics } from './analytics.controller.js';

const router = Router();

// Keep the static '/school' path registered BEFORE the parameterized
// '/class/:classId'. They sit under different first segments so neither can
// shadow the other today, but Story 8.2 lost time to exactly this class of bug
// and 8.4 avoided it only because the warning survived in the code.

// School-wide/grade-level aggregates. Teachers are excluded here by design:
// AC4 scopes them to their own classes, which /class/:classId already serves.
router.get('/school', verifyToken, requireRole(['PRINCIPAL', 'ADMINISTRATOR']), getSchoolAnalytics);

// Per-class analytics. PRINCIPAL/ADMINISTRATOR reach any class; a TEACHER is
// narrowed to their own inside the controller (AC3).
router.get(
  '/class/:classId',
  verifyToken,
  requireRole(['TEACHER', 'PRINCIPAL', 'ADMINISTRATOR']),
  getClassAnalytics
);

export default router;
