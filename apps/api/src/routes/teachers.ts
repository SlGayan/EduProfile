import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { verifyToken, requireRole, AuthRequest } from '../middleware/authMiddleware.js';
import { getPendingActivities } from '../modules/activities/activities.controller.js';
import { getPendingStudentCertificates } from '../modules/studentCertificates/studentCertificates.controller.js';
import {
  listPendingProfileRequests,
  reviewProfileRequest,
} from '../modules/profileRequests/profileRequests.controller.js';
import { updateTeacherSelfSchema } from '../validators/teacherValidators.js';
import { getTeacherDashboard } from '../modules/teacher-dashboard/teacher-dashboard.controller.js';
import { deriveClassName } from '../lib/classIdentity.js';

const prisma = new PrismaClient();
const router = Router();

router.use(verifyToken);

// GET /api/teachers/me — Story 12.1's read-only profile view, carried here
// since it never landed on this branch; extended with the Story 12.2
// self-edit fields so the profile page's edit form can pre-fill them.
router.get('/me', requireRole(['TEACHER']), async (req: AuthRequest, res) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: {
        id: true,
        displayName: true,
        phoneNumber: true,
        address: true,
        createdAt: true,
        user: { select: { email: true, role: true } },
        classes: { select: { id: true, gradeLevel: true, section: true } },
      },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'No teacher profile found for this account' });
    }

    return res.status(200).json({
      id: teacher.id,
      staffId: `TCH-${String(teacher.id).padStart(4, '0')}`,
      displayName: teacher.displayName,
      phoneNumber: teacher.phoneNumber,
      address: teacher.address,
      email: teacher.user.email,
      role: teacher.user.role,
      joinedDate: teacher.createdAt,
      classes: teacher.classes.map((c) => ({ id: c.id, name: deriveClassName(c) })),
    });
  } catch (err) {
    console.error('Error fetching teacher profile:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/teachers/me — immediate self-edit, no approval step (Story 12.2).
router.patch('/me', requireRole(['TEACHER']), async (req: AuthRequest, res) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });
    if (!teacher) {
      return res.status(404).json({ error: 'No teacher profile found for this account' });
    }

    const parsed = updateTeacherSelfSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }
    const { displayName, phoneNumber, address } = parsed.data;

    const updated = await prisma.teacher.update({
      where: { id: teacher.id },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(phoneNumber !== undefined && { phoneNumber }),
        ...(address !== undefined && { address }),
      },
    });

    return res.status(200).json({
      id: String(updated.id),
      displayName: updated.displayName,
      phoneNumber: updated.phoneNumber,
      address: updated.address,
    });
  } catch (err) {
    console.error('Error updating teacher profile:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me/classes', requireRole(['TEACHER']), async (req: AuthRequest, res) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      include: { classes: true },
    });

    if (!teacher) {
      return res.status(403).json({ error: 'Teacher profile not found' });
    }

    return res.status(200).json(teacher.classes.map((c) => ({ id: String(c.id), name: deriveClassName(c) })));
  } catch (err) {
    console.error('Error fetching teacher classes:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me/subject-assignments', requireRole(['TEACHER']), async (req: AuthRequest, res) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      include: {
        subjectAssignments: {
          select: {
            classId: true,
            subjectId: true,
            class: { select: { gradeLevel: true, section: true } },
            subject: { select: { name: true } },
          },
          // Story 13.1 — `Class.name` is no longer a column, so this DB-level
          // sort orders by the structural identity instead. Grade then section
          // reproduces the old alphabetical-by-name order for the
          // `Grade {n}-{section}` names it used to sort.
          orderBy: [
            { class: { gradeLevel: 'asc' } },
            { class: { section: 'asc' } },
            { subject: { name: 'asc' } },
          ],
        },
      },
    });

    if (!teacher) {
      return res.status(403).json({ error: 'Teacher profile not found' });
    }

    return res.status(200).json(
      teacher.subjectAssignments.map((a) => ({
        classId: String(a.classId),
        className: deriveClassName(a.class),
        subjectId: String(a.subjectId),
        subjectName: a.subject.name,
      }))
    );
  } catch (err) {
    console.error('Error fetching teacher subject assignments:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me/pending-activities', requireRole(['TEACHER']), getPendingActivities);

router.get('/me/pending-student-certificates', requireRole(['TEACHER']), getPendingStudentCertificates);

router.get('/me/profile-requests', requireRole(['TEACHER']), listPendingProfileRequests);

// `/profile-requests/:id` — a literal `profile-requests` prefix ahead of the
// `:id` segment, so it can never be shadowed by (or shadow) a future generic
// `/:id` teacher-lookup route the way an un-prefixed `/:id` would. Kept above
// the `/` list route below purely for grouping with the other `/me`-adjacent
// routes above, not because ordering matters here.
router.patch('/profile-requests/:id', requireRole(['TEACHER']), reviewProfileRequest);

router.get('/me/dashboard', requireRole(['TEACHER']), getTeacherDashboard);

router.get('/', requireRole(['ADMINISTRATOR', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const teachers = await prisma.teacher.findMany({
      where: { user: { deletedAt: null } },
      select: { id: true, user: { select: { email: true } } },
    });

    return res.status(200).json({ teachers });
  } catch (err) {
    console.error('Error fetching teachers:', err);
    return res.status(500).json({ error: 'Failed to fetch teachers' });
  }
});

export default router;
