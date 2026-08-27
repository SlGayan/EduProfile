import { randomUUID } from 'crypto';
import path from 'path';
import { Response } from 'express';
import { PrismaClient, StudentCertificate } from '@prisma/client';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import {
  createStudentCertificateSchema,
  updateStudentCertificateSchema,
} from '../../validators/studentCertificateValidators.js';
// Reused rather than duplicated: the photo upload flow in routes/students.ts
// already imports this generic Azure blob wrapper from the materials module,
// so that is the established precedent for sharing it across modules.
import { uploadBlob, deleteBlob, blobExists, getDownloadSasUrl } from '../materials/materials.blob.js';

const prisma = new PrismaClient();

const ROLE_ADMIN = 'admin';

// Reviewer relation is selected consistently wherever a certificate is
// returned, so this shape is the one place the include and the read agree.
const REVIEWER_INCLUDE = {
  reviewedBy: { select: { email: true, teacher: { select: { fullName: true } } } },
} as const;

type CertificateWithReviewer = StudentCertificate & {
  reviewedBy?: { email: string; teacher: { fullName: string | null } | null } | null;
};

/** A teacher's display name if they have one, else the reviewing user's email (covers admin reviewers). */
function reviewerDisplayName(reviewedBy: CertificateWithReviewer['reviewedBy']): string | null {
  if (!reviewedBy) return null;
  return reviewedBy.teacher?.fullName ?? reviewedBy.email;
}

function serializeCertificate(certificate: CertificateWithReviewer) {
  return {
    id: String(certificate.id),
    title: certificate.title,
    issuingOrganization: certificate.issuingOrganization,
    category: certificate.category,
    issueDate: certificate.issueDate.toISOString(),
    description: certificate.description,
    evidenceUrl: certificate.evidenceUrl,
    fileUrl: certificate.fileUrl,
    fileType: certificate.fileType,
    status: certificate.status,
    teacherNote: certificate.teacherNote,
    reviewedByName: reviewerDisplayName(certificate.reviewedBy),
    reviewedAt: certificate.reviewedAt ? certificate.reviewedAt.toISOString() : null,
    createdAt: certificate.createdAt.toISOString(),
  };
}

const MAX_INT4 = 2147483647;

function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1 || id > MAX_INT4) return null;
  return id;
}

type AuthzFailure = { status: number; error: string };

/**
 * Same shape as activities.controller's authorizeStudentAccess: administrators
 * reach any student, teachers only students who share at least one class with
 * them.
 */
async function authorizeStudentAccess(
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
      error: 'You do not have permission to review certificates for this student',
    };
  }

  return null;
}

async function uploadEvidenceFile(studentId: number, file: Express.Multer.File) {
  const blobKey = `student-certificates/student-${studentId}-${randomUUID()}${path.extname(file.originalname)}`;
  await uploadBlob(blobKey, file.buffer, file.mimetype);
  return blobKey;
}

/**
 * GET /api/students/me/student-certificates — the caller's own record, role
 * STUDENT. Same contract as listMyActivities/listMyCertificates: identity
 * comes from the verified token, empty is `200 []`, never 404.
 *
 * MUST be registered above `/:id/...` in routes/students.ts, same
 * route-ordering rule as /me/activities and /me/certificates.
 */
export const listMyStudentCertificates = async (req: AuthRequest, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });
    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const certificates = await prisma.studentCertificate.findMany({
      where: { studentId: student.id },
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      include: REVIEWER_INCLUDE,
    });

    return res.status(200).json(certificates.map(serializeCertificate));
  } catch (err) {
    console.error('Error listing own student certificates:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/students/me/student-certificates
export const submitMyStudentCertificate = async (req: AuthRequest, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const parsed = createStudentCertificateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { title, issuingOrganization, category, issueDate, description, evidenceUrl } = parsed.data;

    if (!evidenceUrl && !req.file) {
      return res.status(400).json({
        error: 'Provide at least one form of evidence: an evidence link or an uploaded file',
      });
    }

    let blobKey: string | undefined;
    if (req.file) {
      blobKey = await uploadEvidenceFile(student.id, req.file);
    }

    try {
      const certificate = await prisma.studentCertificate.create({
        data: {
          studentId: student.id,
          title,
          issuingOrganization,
          category,
          issueDate: new Date(issueDate),
          description: description ?? null,
          evidenceUrl: evidenceUrl ?? null,
          fileUrl: blobKey ?? null,
          fileType: req.file?.mimetype ?? null,
          status: 'PENDING',
        },
      });

      return res.status(201).json(serializeCertificate(certificate));
    } catch (err) {
      if (blobKey) {
        await deleteBlob(blobKey).catch((cleanupErr) =>
          console.error('Failed to compensate blob after DB insert failure:', cleanupErr)
        );
      }
      throw err;
    }
  } catch (err) {
    console.error('Error submitting student certificate:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/students/me/student-certificates/:id
export const updateMyStudentCertificate = async (req: AuthRequest, res: Response) => {
  try {
    const certificateId = parseId(req.params.id);
    if (certificateId === null) {
      return res.status(400).json({ error: 'Invalid certificate ID' });
    }

    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const existing = await prisma.studentCertificate.findFirst({
      where: { id: certificateId, studentId: student.id },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    if (existing.status !== 'NEEDS_CORRECTION') {
      return res.status(403).json({ error: 'Only a certificate needing correction can be edited' });
    }

    const parsed = updateStudentCertificateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { title, issuingOrganization, category, issueDate, description, evidenceUrl } = parsed.data;

    const nextEvidenceUrl = evidenceUrl !== undefined ? evidenceUrl : existing.evidenceUrl ?? undefined;
    const willHaveFile = Boolean(req.file) || existing.fileUrl !== null;
    if (!nextEvidenceUrl && !willHaveFile) {
      return res.status(400).json({
        error: 'Provide at least one form of evidence: an evidence link or an uploaded file',
      });
    }

    let newBlobKey: string | undefined;
    if (req.file) {
      newBlobKey = await uploadEvidenceFile(student.id, req.file);
    }

    try {
      const updated = await prisma.studentCertificate.update({
        where: { id: certificateId },
        data: {
          ...(title !== undefined && { title }),
          ...(issuingOrganization !== undefined && { issuingOrganization }),
          ...(category !== undefined && { category }),
          ...(issueDate !== undefined && { issueDate: new Date(issueDate) }),
          ...(description !== undefined && { description }),
          ...(evidenceUrl !== undefined && { evidenceUrl }),
          ...(newBlobKey && { fileUrl: newBlobKey, fileType: req.file!.mimetype }),
          status: 'PENDING',
          teacherNote: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });

      // Old blob is replaced only after the DB write succeeds, mirroring the
      // photo upload flow's ordering in routes/students.ts.
      if (newBlobKey && existing.fileUrl) {
        await deleteBlob(existing.fileUrl).catch((err) =>
          console.error('Failed to delete previous certificate blob:', err)
        );
      }

      return res.status(200).json(serializeCertificate(updated));
    } catch (err) {
      if (newBlobKey) {
        await deleteBlob(newBlobKey).catch((cleanupErr) =>
          console.error('Failed to compensate blob after DB update failure:', cleanupErr)
        );
      }
      throw err;
    }
  } catch (err) {
    console.error('Error updating student certificate:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function sanitizeFilename(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'certificate';
}

async function streamCertificateFile(certificate: StudentCertificate, res: Response) {
  if (!certificate.fileUrl) {
    return res.status(404).json({ error: 'This certificate has no uploaded file' });
  }

  const blobKey = certificate.fileUrl;
  if (!(await blobExists(blobKey))) {
    return res.status(404).json({ error: 'File not found in storage' });
  }

  const downloadFilename = `${sanitizeFilename(certificate.title)}${path.extname(blobKey)}`;
  const sasUrl = await getDownloadSasUrl(blobKey, downloadFilename);
  return res.redirect(302, sasUrl);
}

// GET /api/students/me/student-certificates/:id/file
export const downloadMyStudentCertificateFile = async (req: AuthRequest, res: Response) => {
  try {
    const certificateId = parseId(req.params.id);
    if (certificateId === null) {
      return res.status(400).json({ error: 'Invalid certificate ID' });
    }

    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const certificate = await prisma.studentCertificate.findFirst({
      where: { id: certificateId, studentId: student.id },
    });
    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    return streamCertificateFile(certificate, res);
  } catch (err) {
    console.error('Error downloading own certificate file:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/teachers/me/pending-student-certificates
export const getPendingStudentCertificates = async (req: AuthRequest, res: Response) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      include: { classes: true },
    });
    if (!teacher || teacher.classes.length === 0) {
      return res.status(200).json([]);
    }
    const classIds = teacher.classes.map((c) => c.id);

    const pending = await prisma.studentCertificate.findMany({
      where: {
        status: 'PENDING',
        student: { classes: { some: { id: { in: classIds } } }, user: { deletedAt: null } },
      },
      include: { student: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(
      pending.map((cert) => ({
        ...serializeCertificate(cert),
        studentName: cert.student.fullName,
        admissionNumber: cert.student.admissionNumber,
      }))
    );
  } catch (err) {
    console.error('Error fetching pending student certificates:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/student-certificates/:id/file — teacher/admin, for reviewing evidence.
export const downloadStudentCertificateFileForReview = async (req: AuthRequest, res: Response) => {
  try {
    const certificateId = parseId(req.params.id);
    if (certificateId === null) {
      return res.status(400).json({ error: 'Invalid certificate ID' });
    }

    const certificate = await prisma.studentCertificate.findFirst({
      where: { id: certificateId, student: { user: { deletedAt: null } } },
    });
    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const failure = await authorizeStudentAccess(req, certificate.studentId);
    if (failure) {
      return res.status(failure.status).json({ error: failure.error });
    }

    return streamCertificateFile(certificate, res);
  } catch (err) {
    console.error('Error downloading certificate file for review:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/student-certificates/:id/status
export const reviewStudentCertificate = async (req: AuthRequest, res: Response) => {
  try {
    const certificateId = parseId(req.params.id);
    if (certificateId === null) {
      return res.status(400).json({ error: 'Invalid certificate ID' });
    }

    const { status, teacherNote } = req.body;
    if (!['APPROVED', 'REJECTED', 'NEEDS_CORRECTION'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (teacherNote !== undefined && typeof teacherNote !== 'string') {
      return res.status(400).json({ error: 'teacherNote must be a string' });
    }
    if ((status === 'NEEDS_CORRECTION' || status === 'REJECTED') && !teacherNote) {
      return res
        .status(400)
        .json({ error: 'teacherNote is required when requesting a correction or rejecting' });
    }

    const certificate = await prisma.studentCertificate.findFirst({
      where: { id: certificateId, student: { user: { deletedAt: null } } },
      select: { studentId: true },
    });
    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const failure = await authorizeStudentAccess(req, certificate.studentId);
    if (failure) {
      return res.status(failure.status).json({ error: failure.error });
    }

    const updated = await prisma.studentCertificate.update({
      where: { id: certificateId },
      data: {
        status,
        teacherNote: teacherNote ?? null,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
      },
      include: REVIEWER_INCLUDE,
    });

    return res.status(200).json(serializeCertificate(updated));
  } catch (err) {
    console.error('Error reviewing student certificate:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
