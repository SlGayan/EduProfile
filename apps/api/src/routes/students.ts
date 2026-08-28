import { randomUUID } from 'crypto';
import path from 'path';
import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { verifyToken, requireRole, AuthRequest } from '../middleware/authMiddleware.js';
import {
  EXPECTED_IMPORT_COLUMNS,
  studentImportRowSchema,
  studentSearchQuerySchema,
  updateMyProfileSchema,
  upsertGuardianSchema,
  createStudentSchema,
} from '../validators/studentValidators.js';
import {
  listActivities,
  createActivity,
  listMyActivities,
  submitMyActivity,
  updateMyActivity,
} from '../modules/activities/activities.controller.js';
import { listMyMaterials } from '../modules/materials/materials.controller.js';
import { uploadBlob, deleteBlob, getInlineSasUrl } from '../modules/materials/materials.blob.js';
import { listMyCertificates, getMyCertificatePdf } from '../modules/certificates/certificates.controller.js';
import {
  listMyStudentCertificates,
  submitMyStudentCertificate,
  updateMyStudentCertificate,
  downloadMyStudentCertificateFile,
} from '../modules/studentCertificates/studentCertificates.controller.js';
import { uploadCertificateFile } from '../modules/studentCertificates/studentCertificates.upload.js';
import {
  submitProfileRequest,
  listMyProfileRequests,
} from '../modules/profileRequests/profileRequests.controller.js';
import { deriveClassName } from '../lib/classIdentity.js';

const prisma = new PrismaClient();
const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024;
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      return cb(null, false);
    }
    cb(null, true);
  },
});

function uploadPhotoFile(req: AuthRequest, res: Response, next: NextFunction) {
  photoUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Photo exceeds the maximum allowed size of 5MB' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      console.error('Photo upload error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    next();
  });
}

// Sized for legitimate interactive staff search (not /login's 5/15min) —
// blunts NIC-enumeration attempts without hindering normal use.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many search requests. Please slow down and try again shortly.' },
});

function escapeLikeWildcards(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

router.use(verifyToken);

router.get('/me', requireRole(['STUDENT']), async (req: AuthRequest, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      include: {
        user: true,
        classes: { include: { teacher: { include: { user: true } } } },
        guardian: true,
      },
    });

    if (!student) {
      return res.status(404).json({ error: 'No student profile found for this account' });
    }

    const assignedClass = student.classes[0] ?? null;
    const classTeacher = assignedClass?.teacher ?? null;

    const photoUrl = student.photoUrl ? await getInlineSasUrl(student.photoUrl) : null;

    return res.status(200).json({
      id: student.id,
      fullName: student.fullName,
      indexNumber: student.indexNumber,
      dateOfBirth: student.dateOfBirth,
      address: student.address,
      phoneNumber: student.phoneNumber,
      nicNumber: student.nicNumber,
      olYear: student.olYear,
      alYear: student.alYear,
      email: student.user.email,
      assignedClass: assignedClass ? deriveClassName(assignedClass) : null,
      academicYear: assignedClass?.year ?? null,
      status: student.status,
      photoUrl,
      admissionDate: student.dateOfAdmission,
      updatedAt: student.updatedAt,
      guardian: student.guardian
        ? {
            guardianName: student.guardian.guardianName,
            primaryPhone: student.guardian.primaryPhone,
            emergencyContactPhone: student.guardian.emergencyContactPhone,
          }
        : null,
      classTeacher: classTeacher
        ? {
            fullName: classTeacher.displayName,
            phone: classTeacher.phoneNumber,
            email: classTeacher.user.email,
          }
        : null,
    });
  } catch (err) {
    console.error('Error fetching student profile:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/me', requireRole(['STUDENT']), async (req: AuthRequest, res) => {
  try {
    const parsed = updateMyProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { address, nicNumber, email } = parsed.data;

    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
    });
    if (!student) {
      return res.status(404).json({ error: 'No student profile found for this account' });
    }

    if (email !== undefined) {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing && existing.id !== req.user!.id) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    try {
      await prisma.$transaction([
        prisma.student.update({
          where: { id: student.id },
          data: {
            ...(address !== undefined && { address }),
            ...(nicNumber !== undefined && { nicNumber }),
          },
        }),
        ...(email !== undefined
          ? [prisma.user.update({ where: { id: req.user!.id }, data: { email: email.trim().toLowerCase() } })]
          : []),
      ]);
    } catch (txErr: any) {
      if (txErr?.code === 'P2002') {
        return res.status(409).json({ error: 'NIC number or email already in use' });
      }
      throw txErr;
    }

    return res.status(200).json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Error updating student profile:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/me/guardian', requireRole(['STUDENT']), async (req: AuthRequest, res) => {
  try {
    const parsed = upsertGuardianSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
    });
    if (!student) {
      return res.status(404).json({ error: 'No student profile found for this account' });
    }

    const { guardianName, primaryPhone, emergencyContactPhone } = parsed.data;

    const guardian = await prisma.guardian.upsert({
      where: { studentId: student.id },
      update: { guardianName, primaryPhone, emergencyContactPhone },
      create: { studentId: student.id, guardianName, primaryPhone, emergencyContactPhone },
    });

    return res.status(200).json({
      guardianName: guardian.guardianName,
      primaryPhone: guardian.primaryPhone,
      emergencyContactPhone: guardian.emergencyContactPhone,
    });
  } catch (err) {
    console.error('Error updating guardian details:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/me/photo', requireRole(['STUDENT']), uploadPhotoFile, async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded, or file type not allowed (JPEG, PNG, WebP only)' });
    }

    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
    });
    if (!student) {
      return res.status(404).json({ error: 'No student profile found for this account' });
    }

    const previousPhotoKey = student.photoUrl;
    const blobKey = `avatars/student-${student.id}-${randomUUID()}${path.extname(req.file.originalname)}`;
    await uploadBlob(blobKey, req.file.buffer, req.file.mimetype);

    try {
      await prisma.student.update({ where: { id: student.id }, data: { photoUrl: blobKey } });
    } catch (err) {
      await deleteBlob(blobKey).catch((cleanupErr) =>
        console.error('Failed to compensate blob after DB update failure:', cleanupErr)
      );
      throw err;
    }

    if (previousPhotoKey) {
      await deleteBlob(previousPhotoKey).catch((err) =>
        console.error('Failed to delete previous avatar blob:', err)
      );
    }

    const photoUrl = await getInlineSasUrl(blobKey);
    return res.status(200).json({ photoUrl });
  } catch (err) {
    console.error('Error uploading student photo:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Story: the caller's own character certificates. Same route-ordering rule as
// /me/activities and /me/materials above: must stay above the `/:id/...`
// routes at the bottom of this file, or it would match id="me" there and 403
// before reaching this handler. Handlers live in the certificates module
// (mirrors listMyActivities/listMyMaterials living in their own modules).
router.get('/me/certificates', requireRole(['STUDENT']), listMyCertificates);
router.get('/me/certificates/:id/pdf', requireRole(['STUDENT']), getMyCertificatePdf);

// Self-added certificates (external course/competition certificates the
// student reports, distinct from the principal-issued CharacterCertificate
// above). Same route-ordering rule: must stay above `/:id/...` below.
router.get('/me/student-certificates', requireRole(['STUDENT']), listMyStudentCertificates);
router.post(
  '/me/student-certificates',
  requireRole(['STUDENT']),
  uploadCertificateFile,
  submitMyStudentCertificate
);
router.patch(
  '/me/student-certificates/:id',
  requireRole(['STUDENT']),
  uploadCertificateFile,
  updateMyStudentCertificate
);
router.get(
  '/me/student-certificates/:id/file',
  requireRole(['STUDENT']),
  downloadMyStudentCertificateFile
);

// Story 8.4 — the caller's own activities.
//
// DELIBERATELY REGISTERED HERE, directly beside `/me` and far above the
// `/:id/activities` routes at the bottom of this file. Registered below them,
// this path matches `/:id/activities` with id="me" and is rejected by that
// route's TEACHER/ADMINISTRATOR guard with `403 Insufficient permissions` —
// the STUDENT caller never reaches the handler, and the failure reads as an
// auth problem rather than a routing one. Do not move it.
router.get('/me/activities', requireRole(['STUDENT']), listMyActivities);
router.post('/me/activities', requireRole(['STUDENT']), submitMyActivity);
router.patch('/me/activities/:id', requireRole(['STUDENT']), updateMyActivity);

// Story 12.2 — same route-ordering rule as /me/activities above: must stay
// above the `/:id/...` routes at the bottom of this file, or it would match
// `/:id/activities`-style routes with id="me" and be rejected by their
// TEACHER/ADMINISTRATOR guard before ever reaching this handler.
router.get('/me/profile-requests', requireRole(['STUDENT']), listMyProfileRequests);
router.post('/me/profile-requests', requireRole(['STUDENT']), submitProfileRequest);

// Story 9.4 — the caller's own study materials. Same route-ordering rule as
// /me/activities above: must stay above the `/:id/...` routes at the bottom
// of this file, or it would match id="me" there and 403 before reaching this
// handler.
router.get('/me/materials', requireRole(['STUDENT']), listMyMaterials);

router.get('/search', searchLimiter, requireRole(['ADMINISTRATOR', 'PRINCIPAL', 'TEACHER']), async (req: AuthRequest, res) => {
  try {
    const parsed = studentSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid search parameters',
        details: parsed.error.issues,
      });
    }

    const { fullName, studentId, nicNumber, olYear, alYear, page, pageSize } = parsed.data;

    const where: Prisma.StudentWhereInput = {
      user: { deletedAt: null },
      ...(fullName !== undefined && { fullName: { contains: escapeLikeWildcards(fullName), mode: 'insensitive' } }),
      ...(studentId !== undefined && { indexNumber: studentId }),
      ...(nicNumber !== undefined && { nicNumber }),
      ...(olYear !== undefined && { olYear }),
      ...(alYear !== undefined && { alYear }),
    };

    const [students, total] = await prisma.$transaction([
      prisma.student.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          indexNumber: true,
          fullName: true,
          dateOfBirth: true,
          olYear: true,
          alYear: true,
        },
      }),
      prisma.student.count({ where }),
    ]);

    return res.status(200).json({
      students,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('Error searching students:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/import', requireRole(['ADMINISTRATOR', 'TEACHER']), upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded (expected field name "file")' });
    }

    let records: Record<string, string>[];
    try {
      records = parse(req.file.buffer, { columns: true, trim: true, skip_empty_lines: true });
    } catch (parseErr) {
      return res.status(400).json({ error: 'Failed to parse CSV file' });
    }

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV file contains no data rows' });
    }

    const actualColumns = Object.keys(records[0]!);
    const missing = EXPECTED_IMPORT_COLUMNS.filter((col) => !actualColumns.includes(col));
    const unexpected = actualColumns.filter(
      (col) => !(EXPECTED_IMPORT_COLUMNS as readonly string[]).includes(col)
    );
    if (missing.length > 0 || unexpected.length > 0) {
      return res.status(400).json({
        error: 'CSV header does not match the expected columns',
        expectedColumns: EXPECTED_IMPORT_COLUMNS,
        missingColumns: missing,
        unexpectedColumns: unexpected,
      });
    }

    const rowErrors: { row: number; errors: string[] }[] = [];
    const validRows: { rowNumber: number; data: ReturnType<typeof studentImportRowSchema.parse> }[] = [];

    records.forEach((record, index) => {
      const rowNumber = index + 2; // account for header row, 1-indexed
      const parsed = studentImportRowSchema.safeParse(record);
      if (!parsed.success) {
        rowErrors.push({
          row: rowNumber,
          errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        });
      } else {
        validRows.push({ rowNumber, data: parsed.data });
      }
    });

    if (rowErrors.length > 0) {
      return res.status(400).json({ error: 'CSV contains invalid rows', rowErrors });
    }

    const indexNumbers = validRows.map((r) => r.data.indexNumber);
    const duplicateIndexNumbers = indexNumbers.filter((val, i) => indexNumbers.indexOf(val) !== i);
    if (duplicateIndexNumbers.length > 0) {
      return res.status(400).json({
        error: 'CSV contains duplicate indexNumber values',
        duplicateIndexNumbers: [...new Set(duplicateIndexNumbers)],
      });
    }

    // A Teacher importing students obviously means "add these to my class" —
    // the single-record `POST /api/students` already does this, and the bulk
    // path should not behave differently just because it's a CSV. Only
    // applies when the teacher owns exactly one class; an Administrator's
    // import is never auto-assigned, matching its existing (unchanged)
    // behavior, and an ambiguous multi-class teacher is left for an explicit
    // admin assignment rather than guessing which class was meant.
    let autoEnrollClassId: number | null = null;
    if (req.user!.role === 'teacher') {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: req.user!.id, user: { deletedAt: null } },
        include: { classes: true },
      });
      if (teacher && teacher.classes.length === 1) {
        autoEnrollClassId = teacher.classes[0]!.id;
      }
    }

    let createdCount = 0;
    let updatedCount = 0;
    const importedStudents: {
      indexNumber: string;
      fullName: string;
      email: string;
      status: 'created' | 'updated';
    }[] = [];

    try {
      await prisma.$transaction(async (tx: any) => {
        for (const { data } of validRows) {
          const existingStudent = await tx.student.findUnique({
            where: { indexNumber: data.indexNumber },
            include: { user: true },
          });

          if (existingStudent) {
            await tx.student.update({
              where: { id: existingStudent.id },
              data: {
                fullName: data.fullName,
                dateOfBirth: new Date(data.dateOfBirth),
                address: data.address,
                nicNumber: data.nicNumber ?? null,
                olYear: data.olYear ?? null,
                alYear: data.alYear ?? null,
                ...(autoEnrollClassId !== null && { classes: { connect: { id: autoEnrollClassId } } }),
              },
            });
            updatedCount++;
            importedStudents.push({
              indexNumber: data.indexNumber,
              fullName: data.fullName,
              email: existingStudent.user.email,
              status: 'updated',
            });
          } else {
            // Deterministic placeholder password; student resets it on first login.
            const placeholderPassword = `Student@${data.indexNumber}`;
            const hashedPassword = await bcrypt.hash(placeholderPassword, 10);

            const user = await tx.user.create({
              data: {
                email: data.email.trim().toLowerCase(),
                password: hashedPassword,
                role: 'STUDENT',
                mustChangePassword: true,
              },
            });

            await tx.student.create({
              data: {
                userId: user.id,
                fullName: data.fullName,
                indexNumber: data.indexNumber,
                dateOfBirth: new Date(data.dateOfBirth),
                address: data.address,
                nicNumber: data.nicNumber ?? null,
                olYear: data.olYear ?? null,
                alYear: data.alYear ?? null,
                ...(autoEnrollClassId !== null && { classes: { connect: { id: autoEnrollClassId } } }),
              },
            });
            createdCount++;
            importedStudents.push({
              indexNumber: data.indexNumber,
              fullName: data.fullName,
              email: user.email,
              status: 'created',
            });
          }
        }
      });
    } catch (txErr: any) {
      console.error('Student import transaction failed:', txErr);
      if (txErr?.code === 'P2002') {
        return res.status(409).json({
          error: 'Import failed due to a uniqueness conflict (duplicate email or indexNumber)',
          details: txErr.meta,
        });
      }
      return res.status(500).json({ error: 'Import failed, no changes were saved' });
    }

    return res.status(200).json({
      message: 'Import completed successfully',
      created: createdCount,
      updated: updatedCount,
      students: importedStudents,
    });
  } catch (err) {
    console.error('Error importing students:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/students — single-record equivalent of `/import`'s per-row logic:
// same field rules (including the `@edu.com` email restriction) and the same
// create-or-update-by-indexNumber behavior. A Teacher additionally gets the
// new student enrolled in a class, since that is the point of adding one from
// their own dashboard; an Administrator has no "own class" and must pass
// `classId` explicitly to enroll (mirrors `/import`, which never assigns a
// class either).
router.post('/', requireRole(['ADMINISTRATOR', 'TEACHER']), async (req: AuthRequest, res) => {
  try {
    const parsed = createStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }
    const { email, fullName, indexNumber, dateOfBirth, address, nicNumber, olYear, alYear, classId } =
      parsed.data;

    // The JWT's role is lowercase and frontend-normalized (see
    // activities.controller.ts) — 'admin', not 'ADMINISTRATOR'.
    let targetClassId: number | null = null;

    if (req.user!.role === 'teacher') {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: req.user!.id, user: { deletedAt: null } },
        include: { classes: true },
      });
      if (!teacher) {
        return res.status(403).json({ error: 'Teacher profile not found' });
      }
      const teacherClassIds = teacher.classes.map((c) => c.id);
      if (teacherClassIds.length === 0) {
        return res.status(403).json({ error: 'Teacher is not assigned to any classes' });
      }
      if (classId !== undefined) {
        if (!teacherClassIds.includes(classId)) {
          return res.status(403).json({ error: 'You do not have permission to enroll a student in that class' });
        }
        targetClassId = classId;
      } else if (teacherClassIds.length === 1) {
        targetClassId = teacherClassIds[0]!;
      } else {
        return res.status(400).json({
          error: 'You teach multiple classes — specify classId',
          classes: teacher.classes.map((c) => ({ id: c.id, name: deriveClassName(c) })),
        });
      }
    } else if (classId !== undefined) {
      const targetClass = await prisma.class.findUnique({ where: { id: classId } });
      if (!targetClass) {
        return res.status(404).json({ error: 'Class not found' });
      }
      targetClassId = classId;
    }

    const existingStudent = await prisma.student.findUnique({ where: { indexNumber } });

    if (existingStudent) {
      const updated = await prisma.student.update({
        where: { id: existingStudent.id },
        data: {
          fullName,
          dateOfBirth: new Date(dateOfBirth),
          address,
          nicNumber: nicNumber ?? null,
          olYear: olYear ?? null,
          alYear: alYear ?? null,
          ...(targetClassId !== null && { classes: { connect: { id: targetClassId } } }),
        },
      });
      return res.status(200).json({ message: 'Student updated', id: updated.id, indexNumber: updated.indexNumber });
    }

    // Deterministic placeholder password, matching `/import` — student resets
    // it on first login (mustChangePassword).
    const placeholderPassword = `Student@${indexNumber}`;
    const hashedPassword = await bcrypt.hash(placeholderPassword, 10);

    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, password: hashedPassword, role: 'STUDENT', mustChangePassword: true },
      });
      return tx.student.create({
        data: {
          userId: user.id,
          fullName,
          indexNumber,
          dateOfBirth: new Date(dateOfBirth),
          address,
          nicNumber: nicNumber ?? null,
          olYear: olYear ?? null,
          alYear: alYear ?? null,
          ...(targetClassId !== null && { classes: { connect: { id: targetClassId } } }),
        },
      });
    });

    return res.status(201).json({ message: 'Student created', id: student.id, indexNumber: student.indexNumber });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({
        error: 'A student with that email or index number already exists',
        details: err.meta,
      });
    }
    console.error('Error creating student:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Extracurricular activities (Story 8.2)
//
// ROUTE ORDER MATTERS. These are the first `:id` routes on this router, and
// they must stay BELOW the literal-path routes above (`/me`, `/search`) so a
// literal segment is never captured as an id.
//
// Story 8.4's `GET /me/activities` (role STUDENT) is registered ABOVE these,
// beside the other `/me` route — it must stay there. Below this point it would
// match `/:id/activities` with id="me" and be rejected by the role guard with
// `403 Insufficient permissions`, never reaching its handler.
//
// `verifyToken` is already applied router-wide above, so only the role guard is
// added per route.
// ---------------------------------------------------------------------------

router.get('/:id/activities', requireRole(['TEACHER', 'ADMINISTRATOR']), listActivities);

router.post('/:id/activities', requireRole(['TEACHER', 'ADMINISTRATOR']), createActivity);

// ---------------------------------------------------------------------------
// Character Certificate (GET /:id/certificate-profile)
// ---------------------------------------------------------------------------
router.get('/:id/certificate-profile', requireRole(['PRINCIPAL']), async (req, res) => {
  try {
    const studentId = parseInt(req.params.id as string, 10);
    if (isNaN(studentId)) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId, user: { deletedAt: null } },
      include: {
        termMarks: {
          include: { subject: true },
          orderBy: [{ year: 'desc' }, { term: 'desc' }],
        },
        activities: {
          where: { status: 'APPROVED' },
          orderBy: { startDate: 'desc' },
        },
      },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    return res.status(200).json(student);
  } catch (err) {
    console.error('Error fetching certificate profile:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
