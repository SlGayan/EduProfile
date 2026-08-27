import { Response } from 'express';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { PrismaClient, ProfileEditRequest } from '@prisma/client';
import {
  submitProfileRequestSchema,
  reviewProfileRequestSchema,
} from '../../validators/profileRequestValidators.js';
import { authorizeStudentAccess } from '../activities/activities.controller.js';

// Per-module client, matching every other file in apps/api/src.
const prisma = new PrismaClient();

// Postgres Int4 ceiling — see activities.controller.ts's `parseId` for why the
// all-digits check matters over a bare `parseInt`.
const MAX_INT4 = 2147483647;

function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1 || id > MAX_INT4) return null;
  return id;
}

function serializeProfileRequest(request: ProfileEditRequest) {
  return {
    id: String(request.id),
    studentId: String(request.studentId),
    requestedPhoneNumber: request.requestedPhoneNumber,
    requestedAddress: request.requestedAddress,
    status: request.status,
    teacherNote: request.teacherNote,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

// GET /api/students/me/profile-requests — role STUDENT. Lets the student's own
// profile page show the status of its latest submission (e.g. a PENDING
// banner) without needing a separate "my latest request" endpoint.
export const listMyProfileRequests = async (req: AuthRequest, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const requests = await prisma.profileEditRequest.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(requests.map(serializeProfileRequest));
  } catch (err) {
    console.error('Error listing own profile requests:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/students/me/profile-requests — role STUDENT.
export const submitProfileRequest = async (req: AuthRequest, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const parsed = submitProfileRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }
    const { phoneNumber, address } = parsed.data;

    // Check-then-insert for "at most one PENDING request per student", done
    // inside a transaction per this story's design decision rather than a
    // partial unique index.
    const created = await prisma.$transaction(async (tx) => {
      const existingPending = await tx.profileEditRequest.findFirst({
        where: { studentId: student.id, status: 'PENDING' },
        select: { id: true },
      });
      if (existingPending) {
        return null;
      }

      return tx.profileEditRequest.create({
        data: {
          studentId: student.id,
          requestedPhoneNumber: phoneNumber ?? null,
          requestedAddress: address ?? null,
        },
      });
    });

    if (created === null) {
      return res.status(409).json({ error: 'You already have a pending profile update request' });
    }

    return res.status(201).json(serializeProfileRequest(created));
  } catch (err) {
    console.error('Error submitting profile request:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/teachers/me/profile-requests — role TEACHER.
export const listPendingProfileRequests = async (req: AuthRequest, res: Response) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      include: { classes: true },
    });
    if (!teacher || teacher.classes.length === 0) {
      return res.status(200).json([]);
    }
    const classIds = teacher.classes.map((c) => c.id);

    const pendingRequests = await prisma.profileEditRequest.findMany({
      where: {
        status: 'PENDING',
        student: { classes: { some: { id: { in: classIds } } }, user: { deletedAt: null } },
      },
      include: { student: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(
      pendingRequests.map((request) => ({
        ...serializeProfileRequest(request),
        studentName: request.student.fullName,
        admissionNumber: request.student.admissionNumber,
      }))
    );
  } catch (err) {
    console.error('Error fetching pending profile requests:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/teachers/profile-requests/:id — role TEACHER.
export const reviewProfileRequest = async (req: AuthRequest, res: Response) => {
  try {
    const requestId = parseId(req.params.id);
    if (requestId === null) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    const parsed = reviewProfileRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }
    const { status, teacherNote } = parsed.data;

    const profileRequest = await prisma.profileEditRequest.findFirst({
      where: { id: requestId, student: { user: { deletedAt: null } } },
    });
    if (!profileRequest) {
      return res.status(404).json({ error: 'Profile request not found' });
    }

    // The spec's contract collapses "no such request" and "exists, but the
    // student isn't in one of my classes" into a single 404 — unlike
    // activities' reuse of this same helper, a teacher here must not be able
    // to distinguish "not found" from "not yours" via the status code.
    const failure = await authorizeStudentAccess(req, profileRequest.studentId);
    if (failure) {
      return res.status(404).json({ error: 'Profile request not found' });
    }

    if (profileRequest.status !== 'PENDING') {
      return res.status(409).json({ error: 'This request has already been reviewed' });
    }

    // The caller is a TEACHER (route-guarded) who just passed authorizeStudentAccess,
    // so a matching, non-deleted Teacher row is guaranteed to exist here.
    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });

    if (status === 'REJECTED') {
      const updated = await prisma.profileEditRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', teacherNote: teacherNote ?? null, reviewedById: teacher!.id },
      });
      return res.status(200).json(serializeProfileRequest(updated));
    }

    // APPROVED — apply the requested fields to the Student record and mark
    // the request reviewed atomically, so a crash between the two writes
    // can never leave an APPROVED request whose Student row was never updated.
    const [updatedRequest] = await prisma.$transaction([
      prisma.profileEditRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', teacherNote: teacherNote ?? null, reviewedById: teacher!.id },
      }),
      prisma.student.update({
        where: { id: profileRequest.studentId },
        data: {
          ...(profileRequest.requestedPhoneNumber !== null && {
            phoneNumber: profileRequest.requestedPhoneNumber,
          }),
          ...(profileRequest.requestedAddress !== null && { address: profileRequest.requestedAddress }),
        },
      }),
    ]);

    return res.status(200).json(serializeProfileRequest(updatedRequest));
  } catch (err) {
    console.error('Error reviewing profile request:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
