import { Response } from 'express';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { PrismaClient, ExtracurricularActivity } from '@prisma/client';
import {
  createActivitySchema,
  updateActivitySchema,
  mergedActivityDatesSchema,
} from '../../validators/activityValidators.js';

// Per-module client, matching every other file in apps/api/src. No shared
// singleton exists in this codebase; introducing one is out of scope here.
const prisma = new PrismaClient();

export type AuthzFailure = { status: number; error: string };

/**
 * The JWT carries a lowercase, frontend-normalized role (see routes/auth.ts) —
 * ADMINISTRATOR is stored as 'admin', not 'administrator'. Route-level
 * `requireRole` guards use the uppercase Prisma enum names because it
 * re-normalizes internally; in-handler comparisons must use these values.
 */
const ROLE_ADMIN = 'admin';

function serializeActivity(activity: ExtracurricularActivity) {
  return {
    id: String(activity.id),
    activityName: activity.activityName,
    activityType: activity.activityType,
    description: activity.description,
    startDate: activity.startDate.toISOString(),
    endDate: activity.endDate ? activity.endDate.toISOString() : null,
    achievements: activity.achievements,
    status: activity.status,
    teacherNote: activity.teacherNote,
    evidenceUrl: activity.evidenceUrl,
  };
}

// Postgres Int4 ceiling. Anything larger is not a missing row — it errors
// inside the Prisma connector with no `code`, which would surface as a 500.
const MAX_INT4 = 2147483647;

/**
 * Express 5 types `req.params[k]` as `string | string[] | undefined`.
 *
 * Deliberately stricter than the `parseInt` + `isNaN` idiom used elsewhere in
 * this codebase: `parseInt` prefix-parses, so `"5.9"`, `"5abc"` and `"1e5"`
 * all yield a valid-looking id and would operate on a real but *different*
 * record. Requiring the whole string to be digits removes that entirely.
 */
function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1 || id > MAX_INT4) return null;
  return id;
}

/**
 * Administrators reach any student. Teachers reach only students who share at
 * least one class with them — `Student.classes` is many-to-many, so this is a
 * "some" check, never a single-class lookup. Mirrors the authorization used by
 * marks.controller's importMarks/getClassMarks.
 */
export async function authorizeStudentAccess(
  req: AuthRequest,
  studentId: number
): Promise<AuthzFailure | null> {
  if (!req.user) {
    return { status: 401, error: 'Unauthorized' };
  }

  if (req.user.role === ROLE_ADMIN) {
    return null;
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: req.user.id, user: { deletedAt: null } },
    include: { classes: true },
  });

  if (!teacher) {
    return { status: 403, error: 'Teacher profile not found' };
  }

  const teacherClassIds = teacher.classes.map((c) => c.id);
  if (teacherClassIds.length === 0) {
    return { status: 403, error: 'Teacher is not assigned to any classes' };
  }

  const sharedClass = await prisma.student.findFirst({
    where: { id: studentId, classes: { some: { id: { in: teacherClassIds } } } },
    select: { id: true },
  });

  if (!sharedClass) {
    return {
      status: 403,
      error: 'You do not have permission to manage activities for this student',
    };
  }

  return null;
}

/** Soft delete lives on User, not Student — every student lookup filters it. */
async function findActiveStudent(studentId: number) {
  return prisma.student.findFirst({
    where: { id: studentId, user: { deletedAt: null } },
    select: { id: true },
  });
}

/**
 * Loads an activity for PUT/DELETE and resolves the 404-vs-403 order that AC3
 * dictates: a missing activity is 404, an existing activity belonging to
 * another teacher's student is 403. This does mean a teacher can distinguish
 * "no such activity" from "not yours" — accepted to satisfy AC3 literally.
 */
async function loadActivityForWrite(
  req: AuthRequest,
  activityId: number
): Promise<{ failure: AuthzFailure } | { activity: ExtracurricularActivity }> {
  const activity = await prisma.extracurricularActivity.findFirst({
    where: { id: activityId, student: { user: { deletedAt: null } } },
  });

  if (!activity) {
    return { failure: { status: 404, error: 'Activity not found' } };
  }

  const failure = await authorizeStudentAccess(req, activity.studentId);
  if (failure) {
    return { failure };
  }

  return { activity };
}

// GET /api/students/:id/activities
export const listActivities = async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseId(req.params.id);
    if (studentId === null) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }

    const student = await findActiveStudent(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const failure = await authorizeStudentAccess(req, studentId);
    if (failure) {
      return res.status(failure.status).json({ error: failure.error });
    }

    const activities = await prisma.extracurricularActivity.findMany({
      where: { studentId },
      // `id` breaks ties: dates are stored at UTC midnight, so same-day rows
      // are common and would otherwise come back in arbitrary Postgres order,
      // visibly reshuffling the list between identical requests.
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    });

    // A student with no activities is an empty array, never a 404 — Story 8.4's
    // empty state depends on this.
    return res.status(200).json(activities.map(serializeActivity));
  } catch (err) {
    console.error('Error listing activities:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/students/:id/activities
export const createActivity = async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseId(req.params.id);
    if (studentId === null) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }

    const student = await findActiveStudent(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const failure = await authorizeStudentAccess(req, studentId);
    if (failure) {
      return res.status(failure.status).json({ error: failure.error });
    }

    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { activityName, activityType, description, startDate, endDate, achievements, evidenceUrl } =
      parsed.data;

    const activity = await prisma.extracurricularActivity.create({
      data: {
        studentId,
        activityName,
        activityType,
        description: description ?? null,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        achievements: achievements ?? null,
        evidenceUrl: evidenceUrl ?? null,
        status: 'APPROVED',
      },
    });

    return res.status(201).json(serializeActivity(activity));
  } catch (err: any) {
    // The existence check and the insert are separate queries; if the student
    // disappears in between, the FK (ON DELETE RESTRICT) rejects the insert.
    if (err?.code === 'P2003') {
      return res.status(404).json({ error: 'Student not found' });
    }
    console.error('Error creating activity:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PUT /api/activities/:id
export const updateActivity = async (req: AuthRequest, res: Response) => {
  try {
    const activityId = parseId(req.params.id);
    if (activityId === null) {
      return res.status(400).json({ error: 'Invalid activity ID' });
    }

    const loaded = await loadActivityForWrite(req, activityId);
    if ('failure' in loaded) {
      return res.status(loaded.failure.status).json({ error: loaded.failure.error });
    }

    const parsed = updateActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const existing = loaded.activity;
    const { activityName, activityType, description, startDate, endDate, achievements, evidenceUrl } =
      parsed.data;

    // The payload may carry only one of the two dates, so the order rule is
    // re-checked against the merged result. The Zod refinement only sees the
    // request body.
    const nextStartDate = startDate !== undefined ? new Date(startDate) : existing.startDate;
    const nextEndDate = endDate !== undefined ? new Date(endDate) : existing.endDate;

    const merged = mergedActivityDatesSchema.safeParse({
      startDate: nextStartDate,
      endDate: nextEndDate,
    });
    if (!merged.success) {
      return res.status(400).json({ error: 'Invalid input', details: merged.error.issues });
    }

    const activity = await prisma.extracurricularActivity.update({
      where: { id: activityId },
      data: {
        ...(activityName !== undefined && { activityName }),
        ...(activityType !== undefined && { activityType }),
        ...(description !== undefined && { description }),
        ...(achievements !== undefined && { achievements }),
        ...(evidenceUrl !== undefined && { evidenceUrl }),
        ...(startDate !== undefined && { startDate: nextStartDate }),
        ...(endDate !== undefined && { endDate: nextEndDate }),
      },
    });

    return res.status(200).json(serializeActivity(activity));
  } catch (err: any) {
    // The existence check and the write are separate queries; a concurrent
    // delete between them surfaces as P2025 rather than a missing row.
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'Activity not found' });
    }
    console.error('Error updating activity:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/activities/:id
export const deleteActivity = async (req: AuthRequest, res: Response) => {
  try {
    const activityId = parseId(req.params.id);
    if (activityId === null) {
      return res.status(400).json({ error: 'Invalid activity ID' });
    }

    const loaded = await loadActivityForWrite(req, activityId);
    if ('failure' in loaded) {
      return res.status(loaded.failure.status).json({ error: loaded.failure.error });
    }

    await prisma.extracurricularActivity.delete({ where: { id: activityId } });

    return res.status(200).json({ message: 'Activity deleted' });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'Activity not found' });
    }
    console.error('Error deleting activity:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/students/me/activities — the caller's own record, role STUDENT.
 *
 * No authorization helper is needed: the student's identity comes from the
 * verified token, so there is no cross-student check to perform. `req.user` is
 * guaranteed by `requireRole` on the route, hence the non-null assertion rather
 * than an unreachable 401 branch.
 *
 * MUST be registered above `/:id/activities` in routes/students.ts — otherwise
 * `/me/activities` matches that route with id="me" and is rejected by its
 * TEACHER/ADMINISTRATOR guard before ever reaching this handler.
 */
export const listMyActivities = async (req: AuthRequest, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const activities = await prisma.extracurricularActivity.findMany({
      where: { studentId: student.id },
      // `id` tiebreaker: date-only values all store as UTC midnight, so ties
      // are the norm and Postgres would otherwise order them arbitrarily.
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    });

    // Empty is `200 []`, never 404 — the page's empty state depends on it.
    return res.status(200).json(activities.map(serializeActivity));
  } catch (err) {
    console.error('Error listing own activities:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/students/me/activities
export const submitMyActivity = async (req: AuthRequest, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });

    const { activityName, activityType, description, startDate, endDate, achievements, evidenceUrl } = parsed.data;

    const activity = await prisma.extracurricularActivity.create({
      data: {
        studentId: student.id,
        activityName,
        activityType,
        description: description ?? null,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        achievements: achievements ?? null,
        evidenceUrl: evidenceUrl ?? null,
        status: 'PENDING',
      },
    });

    return res.status(201).json(serializeActivity(activity));
  } catch (err) {
    console.error('Error submitting activity:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/teachers/me/pending-activities
export const getPendingActivities = async (req: AuthRequest, res: Response) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      include: { classes: true },
    });
    if (!teacher || teacher.classes.length === 0) {
      return res.status(200).json([]);
    }
    const classIds = teacher.classes.map((c) => c.id);

    const pendingActivities = await prisma.extracurricularActivity.findMany({
      where: {
        status: 'PENDING',
        student: { classes: { some: { id: { in: classIds } } }, user: { deletedAt: null } }
      },
      include: { student: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(pendingActivities.map((act) => ({
      ...serializeActivity(act),
      studentName: act.student.fullName,
      admissionNumber: act.student.admissionNumber,
    })));
  } catch (err) {
    console.error('Error fetching pending activities:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/activities/:id/status
export const reviewActivity = async (req: AuthRequest, res: Response) => {
  try {
    const activityId = parseId(req.params.id);
    if (activityId === null) return res.status(400).json({ error: 'Invalid activity ID' });

    const { status, teacherNote } = req.body;
    if (!['APPROVED', 'REJECTED', 'NEEDS_CORRECTION'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (teacherNote !== undefined && typeof teacherNote !== 'string') {
      return res.status(400).json({ error: 'teacherNote must be a string' });
    }
    if ((status === 'NEEDS_CORRECTION' || status === 'REJECTED') && !teacherNote) {
      return res.status(400).json({ error: 'teacherNote is required when requesting a correction or rejecting' });
    }

    const activity = await prisma.extracurricularActivity.findFirst({
      where: { id: activityId, student: { user: { deletedAt: null } } },
      select: { studentId: true }
    });
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    const failure = await authorizeStudentAccess(req, activity.studentId);
    if (failure) return res.status(failure.status).json({ error: failure.error });

    const updated = await prisma.extracurricularActivity.update({
      where: { id: activityId },
      data: { 
        status,
        teacherNote: teacherNote ?? null
      },
    });

    return res.status(200).json(serializeActivity(updated));
  } catch (err) {
    console.error('Error reviewing activity:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/students/me/activities/:id
export const updateMyActivity = async (req: AuthRequest, res: Response) => {
  try {
    const activityId = parseId(req.params.id);
    if (activityId === null) return res.status(400).json({ error: 'Invalid activity ID' });

    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const existingActivity = await prisma.extracurricularActivity.findFirst({
      where: { id: activityId, studentId: student.id }
    });

    if (!existingActivity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    if (existingActivity.status === 'APPROVED' || existingActivity.status === 'REJECTED') {
       return res.status(403).json({ error: 'Cannot edit an approved or rejected activity' });
    }

    const parsed = updateActivitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });

    const { activityName, activityType, description, startDate, endDate, achievements, evidenceUrl } = parsed.data;

    const nextStartDate = startDate !== undefined ? new Date(startDate) : existingActivity.startDate;
    const nextEndDate = endDate !== undefined ? new Date(endDate) : existingActivity.endDate;

    const merged = mergedActivityDatesSchema.safeParse({ startDate: nextStartDate, endDate: nextEndDate });
    if (!merged.success) return res.status(400).json({ error: 'Invalid input', details: merged.error.issues });

    const updated = await prisma.extracurricularActivity.update({
      where: { id: activityId },
      data: {
        ...(activityName !== undefined && { activityName }),
        ...(activityType !== undefined && { activityType }),
        ...(description !== undefined && { description }),
        ...(achievements !== undefined && { achievements }),
        ...(evidenceUrl !== undefined && { evidenceUrl }),
        ...(startDate !== undefined && { startDate: nextStartDate }),
        ...(endDate !== undefined && { endDate: nextEndDate }),
        status: 'PENDING',
      }
    });

    return res.status(200).json(serializeActivity(updated));
  } catch (err) {
    console.error('Error updating my activity:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
